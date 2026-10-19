"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, CloudOff, ExternalLink, Loader2, Lock, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  changeSlugAction,
  entryWorkflowAction,
  saveEntryAction,
} from "@/app/(site)/sites/[siteId]/content/actions";
import { EntryActionsMenu } from "@/components/content/entry-actions-menu";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { AdvancedPanel, SearchPanel, SocialPanel, seoChecks } from "@/components/editor/seo-panels";
import { UrlPanel } from "@/components/editor/url-panel";
import { WorkflowControls } from "@/components/editor/workflow-controls";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { Button } from "@/components/ui/button";
import { canEditEntry, readOnlyReason, workflowActions, type WorkflowAction } from "@/lib/content";
import { imageAltSummary, wordCount, type RichTextDoc } from "@/lib/editor/rich-text";
import type { EntryDocument, EntryState } from "@/lib/editor/types";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { entryPath, type EntrySeoInput } from "@/lib/seo";
import type { SiteRole } from "@/lib/types";

type SaveStatus = "saved" | "saving" | "error" | "conflict";

const AUTOSAVE_MS = 1000;
const RETRY_MS = 8000;

const DONE: Record<WorkflowAction, string> = {
  publish: "Published.",
  schedule: "Scheduled.",
  unpublish: "Unpublished. It's a draft again.",
  submit: "Submitted for review.",
  withdraw: "Withdrawn from review. It's a draft again.",
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

const noopSubscribe = () => () => {};
/** True after hydration, so local-time formatting never mismatches the server render. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function EntryEditor({
  siteId,
  siteName,
  domain,
  role,
  userId,
  doc,
}: {
  siteId: string;
  siteName: string;
  domain: string | null;
  role: SiteRole;
  userId: string;
  doc: EntryDocument;
}) {
  const { entry } = doc;
  const [state, setState] = useState<EntryState>({
    status: entry.status,
    updatedAt: entry.updatedAt,
    publishedAt: entry.publishedAt,
    scheduledAt: entry.scheduledAt,
    slug: entry.slug,
  });
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState<RichTextDoc>(doc.body);
  const [seo, setSeo] = useState<EntrySeoInput>(doc.seo);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [workflowPending, setWorkflowPending] = useState(false);
  const hydrated = useHydrated();

  // Lifecycle changes made elsewhere on this page (e.g. Archive in the menu)
  // arrive as new props after refresh(); adopt them if they're newer.
  const [syncedVersion, setSyncedVersion] = useState(entry.updatedAt);
  if (entry.updatedAt !== syncedVersion) {
    setSyncedVersion(entry.updatedAt);
    if (entry.updatedAt > state.updatedAt) {
      setState({
        status: entry.status,
        updatedAt: entry.updatedAt,
        publishedAt: entry.publishedAt,
        scheduledAt: entry.scheduledAt,
        slug: entry.slug,
      });
    }
  }

  const draft = useMemo(() => ({ title, body, seo }), [title, body, seo]);
  const snapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  const policyEntry = {
    status: state.status,
    authorId: entry.authorId,
    publishedAt: state.publishedAt,
  };
  const editable = canEditEntry(role, userId, policyEntry) && saveStatus !== "conflict";
  const lockedReason = readOnlyReason(role, userId, policyEntry);
  const allowed = workflowActions(role, userId, policyEntry);
  const words = useMemo(() => wordCount(body), [body]);
  const path = entryPath(entry.modelKey, state.slug);

  // Refs give the save loop the latest values without re-subscribing.
  const latest = useRef({ snapshot });
  const latestDraft = useRef(draft);
  const version = useRef(state.updatedAt);
  const savedRef = useRef(savedSnapshot);
  const inflight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    latest.current = { snapshot };
    latestDraft.current = draft;
  }, [snapshot, draft]);
  useEffect(() => {
    if (state.updatedAt > version.current) version.current = state.updatedAt;
  }, [state.updatedAt]);

  const save = useCallback(async (): Promise<boolean> => {
    // One save at a time; a queued save picks up whatever changed meanwhile.
    while (inflight.current) await inflight.current;
    const { snapshot: snap } = latest.current;
    if (snap === savedRef.current) return true;
    // Send plain JSON: editor output can contain null-prototype objects,
    // which Server Actions can't serialize.
    const data = JSON.parse(snap) as { title: string; body: RichTextDoc; seo: EntrySeoInput };

    setSaveStatus("saving");
    const run = (async () => {
      try {
        const result = await saveEntryAction(siteId, entry.id, {
          ...data,
          expectedUpdatedAt: version.current,
        });
        if (result.ok) {
          version.current = result.state.updatedAt;
          savedRef.current = snap;
          setState((s) => ({ ...s, ...result.state }));
          setSavedSnapshot(snap);
          setSavedAt(result.state.updatedAt);
          setSaveError(null);
          setSaveStatus("saved");
          return true;
        }
        setSaveError(result.error);
        setSaveStatus(result.conflict ? "conflict" : "error");
        return false;
      } catch {
        setSaveError("Couldn't reach the server. Your changes are kept on this page.");
        setSaveStatus("error");
        return false;
      }
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, [siteId, entry.id]);

  // Autosave shortly after changes stop; retry after a failure.
  useEffect(() => {
    if (!dirty || !editable || saveStatus === "saving") return;
    const timer = setTimeout(() => void save(), saveStatus === "error" ? RETRY_MS : AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, dirty, editable, saveStatus, save]);

  // Ctrl/Cmd+S saves now; leaving with unsaved changes asks first.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (latest.current.snapshot !== savedRef.current || inflight.current) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [save]);

  async function runWorkflow(action: WorkflowAction, scheduledAt?: string) {
    setWorkflowPending(true);
    try {
      if (!(await save())) return "Save your latest changes first.";
      const result = await entryWorkflowAction(siteId, entry.id, {
        action,
        scheduledAt,
        expectedUpdatedAt: version.current,
      });
      if (!result.ok) {
        if (result.conflict) setSaveStatus("conflict");
        return result.error;
      }
      version.current = result.state.updatedAt;
      setState(result.state);
      toast.success(
        action === "schedule" && result.state.scheduledAt
          ? `Scheduled for ${new Date(result.state.scheduledAt).toLocaleString()}.`
          : DONE[action],
      );
      return null;
    } finally {
      setWorkflowPending(false);
    }
  }

  async function applySlug(slug: string, createRedirect: boolean) {
    if (!(await save())) return "Save your latest changes first.";
    const oldPath = entryPath(entry.modelKey, state.slug);
    const result = await changeSlugAction(siteId, entry.id, {
      slug,
      createRedirect,
      expectedUpdatedAt: version.current,
    });
    if (!result.ok) {
      if (result.conflict) setSaveStatus("conflict");
      return result.error;
    }
    version.current = result.state.updatedAt;
    setState(result.state);
    toast.success(
      result.redirectCreated
        ? `URL changed. ${oldPath} now redirects to ${entryPath(entry.modelKey, result.state.slug)}.`
        : "URL changed.",
    );
    return null;
  }

  const listSegment = !entry.isSystemModel
    ? "collections"
    : entry.modelKey === "page"
      ? "pages"
      : "posts";
  const listLabel = !entry.isSystemModel
    ? "Collections"
    : entry.modelKey === "page"
      ? "Pages"
      : "Posts";
  const contentHref = siteHref(siteId, "content");
  const images = imageAltSummary(body);
  const suggestions = seoChecks({ title, seo, words, images })
    .filter((c) => !c.ok)
    .map((c) => c.text);
  const seoProps = {
    seo,
    onChange: (patch: Partial<EntrySeoInput>) => setSeo((s) => ({ ...s, ...patch })),
    title,
    path,
    domain,
    words,
    images,
    readOnly: !editable,
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-8">
        <Breadcrumbs
          items={[
            { label: siteName, href: siteHref(siteId) },
            { label: "Content", href: contentHref },
            { label: listLabel, href: `${contentHref}/${listSegment}` },
            { label: title.trim() || `Untitled ${entry.modelName.toLowerCase()}` },
          ]}
        />
        <h1 className="sr-only">
          {editable ? "Edit" : "View"} {entry.modelName.toLowerCase()}: {title.trim() || "Untitled"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <ContentStatusBadge status={state.status} />
            {state.status === "scheduled" && state.scheduledAt && (
              <span className="text-muted-foreground text-xs">
                for{" "}
                <time dateTime={state.scheduledAt}>
                  {hydrated
                    ? new Date(state.scheduledAt).toLocaleString()
                    : formatDate(state.scheduledAt)}
                </time>
              </span>
            )}
            <SaveIndicator
              status={saveStatus}
              dirty={dirty}
              editable={editable}
              savedAt={savedAt}
              error={saveError}
              onRetry={() => void save()}
            />
          </div>
          <Button variant="outline" asChild>
            <a href={`/preview/${siteId}/${entry.id}`} target="_blank" rel="noopener">
              Preview
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
          <WorkflowControls
            allowed={allowed}
            status={state.status}
            pending={workflowPending}
            suggestions={suggestions}
            onAction={runWorkflow}
          />
          <EntryActionsMenu
            siteId={siteId}
            role={role}
            userId={userId}
            entry={{ ...entry, ...state, title }}
          />
        </div>
      </header>

      {saveStatus === "conflict" ? (
        <Banner tone="error" icon={CircleAlert}>
          <span className="flex-1">
            Someone else changed this entry since you opened it, so your recent edits weren&apos;t
            saved. Reload to get the latest version; copy anything you want to keep first.
          </span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden /> Reload
          </Button>
        </Banner>
      ) : (
        lockedReason && (
          <Banner tone="muted" icon={Lock}>
            {lockedReason}
          </Banner>
        )
      )}

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col">
          <label htmlFor="entry-title" className="sr-only">
            Title
          </label>
          <textarea
            id="entry-title"
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                document.querySelector<HTMLElement>(".ProseMirror")?.focus();
              }
            }}
            placeholder={`Untitled ${entry.modelName.toLowerCase()}`}
            readOnly={!editable}
            maxLength={200}
            rows={1}
            className="placeholder:text-muted-foreground/70 [field-sizing:content] w-full resize-none bg-transparent text-3xl leading-tight font-semibold tracking-tight outline-none sm:text-4xl"
          />
          <p id="entry-body-label" className="sr-only">
            Body
          </p>
          <div className="mt-4">
            <RichTextEditor
              initialContent={doc.body}
              editable={editable}
              media={{ siteId, canUpload: can(role, "media.upload") }}
              onChange={setBody}
              onReady={(normalized) => {
                // The editor normalizes stored JSON (e.g. default attributes). If
                // nothing has been edited yet, adopt that as the saved baseline
                // so merely opening an entry isn't treated as a change.
                if (latest.current.snapshot !== savedRef.current) return;
                const baseline = JSON.stringify({ ...latestDraft.current, body: normalized });
                savedRef.current = baseline;
                setSavedSnapshot(baseline);
                setBody(normalized);
              }}
              labelledBy="entry-body-label"
            />
          </div>
          <p className="text-muted-foreground mt-2 text-xs" aria-live="off">
            {words} {words === 1 ? "word" : "words"}
          </p>
        </div>

        <aside aria-label="Entry settings" className="flex flex-col gap-3">
          <UrlPanel
            modelKey={entry.modelKey}
            slug={state.slug}
            title={title}
            domain={domain}
            hasBeenPublished={state.publishedAt !== null}
            readOnly={!editable}
            onApply={applySlug}
          />
          <SearchPanel {...seoProps} />
          <SocialPanel {...seoProps} />
          <AdvancedPanel
            seo={seo}
            onChange={seoProps.onChange}
            readOnly={!editable}
            schemaType={doc.schemaType}
            modelName={entry.modelName}
          />
          <dl className="text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-1 pt-1 text-xs">
            <dt>Author</dt>
            <dd className="text-foreground">{entry.authorName ?? "Former member"}</dd>
            <dt>Created</dt>
            <dd>{formatDate(entry.createdAt)}</dd>
            <dt>First published</dt>
            <dd>{state.publishedAt ? formatDate(state.publishedAt) : "Not yet"}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
  dirty,
  editable,
  savedAt,
  error,
  onRetry,
}: {
  status: SaveStatus;
  dirty: boolean;
  editable: boolean;
  savedAt: string | null;
  error: string | null;
  onRetry: () => void;
}) {
  let content: React.ReactNode = null;
  if (status === "saving") {
    content = (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </>
    );
  } else if (status === "error") {
    content = (
      <>
        <CloudOff className="text-destructive size-3.5" aria-hidden />
        <span className="text-destructive">Couldn&apos;t save{error ? `: ${error}` : "."}</span>
        <button
          type="button"
          onClick={onRetry}
          className="focus-visible:ring-ring/50 rounded underline underline-offset-2 outline-none focus-visible:ring-[3px]"
        >
          Retry now
        </button>
      </>
    );
  } else if (status === "conflict") {
    content = (
      <>
        <CloudOff className="text-destructive size-3.5" aria-hidden />
        <span className="text-destructive">Not saved: changed elsewhere</span>
      </>
    );
  } else if (dirty && editable) {
    content = "Unsaved changes";
  } else if (savedAt) {
    content = `Saved at ${timeFormat.format(new Date(savedAt))}`;
  } else if (editable) {
    content = "All changes saved";
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs" role="status">
      {content}
    </span>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "error" | "muted";
  icon: typeof Lock;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm sm:px-8"
          : "bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-3 text-sm sm:px-8"
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}
