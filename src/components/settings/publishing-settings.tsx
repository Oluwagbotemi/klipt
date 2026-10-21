"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  previewUrlPatternsAction,
  savePublishingRulesAction,
  saveUrlPatternsAction,
  type RulesState,
} from "@/app/(site)/sites/[siteId]/settings/publishing/actions";
import { InlineAlert } from "@/components/inline-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { siteHref } from "@/lib/navigation";
import type { PatternChange, PublishingSettings } from "@/lib/publishing";
import { examplePath, parsePattern } from "@/lib/url-patterns";

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] sm:max-w-xs";

/** Require review + the default type for "New". */
export function PublishingRulesForm({
  siteId,
  settings,
}: {
  siteId: string;
  settings: Pick<PublishingSettings, "requireReview" | "defaultModelKey" | "types">;
}) {
  const [state, formAction, pending] = useActionState(savePublishingRulesAction, {
    values: { requireReview: settings.requireReview, defaultModelKey: settings.defaultModelKey },
  } satisfies RulesState);
  const [requireReview, setRequireReview] = useState(state.values.requireReview);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="require-review" className="text-sm font-medium">
            Require review before publishing
          </label>
          <p id="require-review-hint" className="text-muted-foreground mt-1 text-sm">
            Editors send entries for review instead of publishing them, and approve only entries
            someone else sent. Owners and admins can still publish directly. Authors always need a
            review.
          </p>
        </div>
        <Switch
          id="require-review"
          name="requireReview"
          checked={requireReview}
          onCheckedChange={setRequireReview}
          aria-describedby="require-review-hint"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="default-type" className="text-sm font-medium">
          Default content type
        </label>
        <select
          id="default-type"
          name="defaultModelKey"
          defaultValue={state.values.defaultModelKey}
          className={selectClass}
          aria-describedby="default-type-hint"
          aria-invalid={state.errors?.defaultModelKey ? true : undefined}
        >
          {settings.types.map((type) => (
            <option key={type.key} value={type.key}>
              {type.name}
            </option>
          ))}
        </select>
        <p id="default-type-hint" className="text-muted-foreground text-xs">
          What the New button under Content › All content creates in one click. The others stay in
          its menu.
        </p>
        {state.errors?.defaultModelKey && (
          <p className="text-destructive text-sm">{state.errors.defaultModelKey}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save"}
        </Button>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {state.saved && !pending ? "Saved." : ""}
        </p>
      </div>
    </form>
  );
}

/**
 * URL pattern per content type. Saving previews which live addresses move,
 * then asks for confirmation before adding the redirects.
 */
export function UrlPatternsForm({
  siteId,
  settings,
}: {
  siteId: string;
  settings: Pick<PublishingSettings, "types" | "archives" | "timeZone">;
}) {
  const saved = Object.fromEntries(settings.types.map((type) => [type.key, type.pattern]));
  const [patterns, setPatterns] = useState<Record<string, string>>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PatternChange[] | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = settings.types.some((type) => patterns[type.key].trim() !== type.pattern);

  function check(): boolean {
    const local: Record<string, string> = {};
    for (const type of settings.types) {
      const parsed = parsePattern(patterns[type.key]);
      if ("error" in parsed) local[type.key] = parsed.error;
    }
    setErrors(local);
    return Object.keys(local).length === 0;
  }

  function review() {
    setFormError(null);
    if (!check()) return;
    startTransition(async () => {
      const result = await previewUrlPatternsAction(siteId, patterns);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.errors ?? {});
        return;
      }
      if (result.changes.some((change) => change.moving > 0)) setConfirm(result.changes);
      else save();
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveUrlPatternsAction(siteId, patterns);
      if (!result.ok) {
        setConfirm(null);
        setFormError(result.error);
        setErrors(result.errors ?? {});
        return;
      }
      setConfirm(null);
      setErrors({});
      const moved = result.redirects ?? 0;
      toast.success(
        moved > 0
          ? `URL patterns saved. ${moved} ${moved === 1 ? "address now redirects" : "addresses now redirect"} to the new one.`
          : "URL patterns saved.",
      );
    });
  }

  const moving = confirm?.reduce((sum, change) => sum + change.moving, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {formError && <InlineAlert>{formError}</InlineAlert>}
      <ul className="flex flex-col gap-4" aria-label="URL patterns">
        {settings.types.map((type) => {
          const value = patterns[type.key];
          const error = errors[type.key];
          const parsed = parsePattern(value);
          const hintId = `pattern-${type.key}-hint`;
          const errorId = `pattern-${type.key}-error`;
          return (
            <li key={type.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <label htmlFor={`pattern-${type.key}`} className="text-sm font-medium">
                  {type.name}
                </label>
                <span className="text-muted-foreground text-xs">
                  {type.live === 0
                    ? "Nothing published yet"
                    : `${type.live} published ${type.live === 1 ? "entry" : "entries"}`}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  id={`pattern-${type.key}`}
                  value={value}
                  onChange={(e) => setPatterns({ ...patterns, [type.key]: e.target.value })}
                  className="min-w-0 flex-1 font-mono text-sm"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={[error ? errorId : null, hintId].filter(Boolean).join(" ")}
                />
                {value.trim() !== type.defaultPattern && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setPatterns({ ...patterns, [type.key]: type.defaultPattern })}
                    aria-label={`Reset ${type.name} to ${type.defaultPattern}`}
                    title={`Reset to ${type.defaultPattern}`}
                  >
                    <RotateCcw aria-hidden />
                  </Button>
                )}
              </div>
              {error && (
                <p id={errorId} className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <p id={hintId} className="text-muted-foreground truncate text-xs">
                Example:{" "}
                <span className="text-foreground font-mono">
                  {"error" in parsed ? "…" : examplePath(value.trim(), settings.timeZone)}
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      <div className="bg-muted/50 text-muted-foreground rounded-xl p-4 text-sm">
        <p>
          Use <code className="text-foreground font-mono">{"{slug}"}</code> at the end, and
          optionally <code className="text-foreground font-mono">{"{yyyy}"}</code> and{" "}
          <code className="text-foreground font-mono">{"{mm}"}</code> for the year and month an
          entry was first published (in your site&apos;s time zone,{" "}
          {settings.timeZone.replace(/_/g, " ")}).
        </p>
        {settings.archives.length > 0 && (
          <p className="mt-2">
            Category and tag pages keep their addresses:{" "}
            {settings.archives.map((archive, i) => (
              <span key={archive.key}>
                {i > 0 && ", "}
                <code className="text-foreground font-mono">{archive.pattern}</code>
              </span>
            ))}
            .
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={review} disabled={pending || !dirty}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Checking…" : "Save URL patterns"}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setPatterns(saved);
              setErrors({});
              setFormError(null);
            }}
            disabled={pending}
          >
            Discard changes
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !pending && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Move {moving} published {moving === 1 ? "address" : "addresses"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Klipt adds a permanent (301) redirect from each old address, so links and search results
            keep working. Your website should follow redirects from the content API.
          </AlertDialogDescription>
          <ul className="flex flex-col gap-3 text-sm">
            {confirm
              ?.filter((change) => change.moving > 0)
              .map((change) => (
                <li key={change.key} className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium">
                    {change.name}: {change.moving} {change.moving === 1 ? "entry" : "entries"}
                  </p>
                  {change.example && (
                    <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1 font-mono text-xs break-all">
                      {change.example.from}
                      <ArrowRight className="size-3 shrink-0" aria-label="moves to" />
                      {change.example.to}
                    </p>
                  )}
                </li>
              ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                save();
              }}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save and add redirects
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Where the site lives: the live address (Domains) and the draft preview route. */
export function LiveAddress({ siteId, domain }: { siteId: string; domain: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Live website</p>
      {domain ? (
        <p className="text-sm">
          <a
            href={`https://${domain}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-mono break-all underline-offset-4 hover:underline"
          >
            https://{domain}
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          No website address yet. Content API URLs and the sitemap use paths only until you add one.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        <Link
          href={siteHref(siteId, "settings", "domains")}
          className="text-primary underline-offset-4 hover:underline"
        >
          {domain ? "Change it under Domains" : "Add it under Domains"}
        </Link>
      </p>
    </div>
  );
}
