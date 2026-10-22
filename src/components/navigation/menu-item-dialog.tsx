"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Globe, Link2, Loader2, Search } from "lucide-react";
import { searchMenuTargetsAction } from "@/app/(site)/sites/[siteId]/navigation/actions";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ContentStatus } from "@/lib/content";
import { isAllowedMenuUrl, MAX_LABEL_LENGTH, MENU_URL_HINT, type MenuItemView } from "@/lib/menus";
import type { LinkTarget } from "@/lib/models";
import { cn } from "@/lib/utils";

export type ItemFields = Pick<
  MenuItemView,
  "label" | "kind" | "entryId" | "url" | "openInNewTab" | "target" | "warning"
>;

/** Add or edit one menu link: an entry (picked by search) or a URL. */
export function MenuItemDialog({
  siteId,
  item,
  onSubmit,
}: {
  siteId: string;
  /** null when adding. */
  item: ItemFields | null;
  onSubmit: (fields: ItemFields) => void;
}) {
  const [kind, setKind] = useState<"entry" | "url">(item?.kind ?? "entry");
  const [label, setLabel] = useState(item?.label ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [openInNewTab, setOpenInNewTab] = useState(item?.openInNewTab ?? false);
  const [entry, setEntry] = useState<{ id: string; target: ItemFields["target"] } | null>(
    item?.kind === "entry" && item.entryId ? { id: item.entryId, target: item.target } : null,
  );
  const [errors, setErrors] = useState<{ label?: string; url?: string; entry?: string }>({});

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const trimmed = label.trim();
    if (!trimmed) next.label = "Give the link a label.";
    if (kind === "url" && !isAllowedMenuUrl(url)) next.url = MENU_URL_HINT;
    if (kind === "entry" && !entry && !(item?.kind === "entry" && item.warning === "deleted")) {
      next.entry = "Choose the entry to link to.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (kind === "url") {
      onSubmit({
        label: trimmed,
        kind,
        url: url.trim(),
        entryId: null,
        openInNewTab,
        target: null,
        warning: null,
      });
    } else {
      const target = entry?.target ?? null;
      onSubmit({
        label: trimmed,
        kind,
        url: null,
        entryId: entry?.id ?? null,
        openInNewTab,
        target,
        warning: !target ? "deleted" : target.status !== "published" ? "unpublished" : null,
      });
    }
  }

  function pick(target: LinkTarget) {
    setEntry({
      id: target.id,
      target: {
        title: target.title,
        status: target.status,
        modelName: target.modelName,
        path: target.path,
      },
    });
    if (!label.trim()) setLabel(target.title.slice(0, MAX_LABEL_LENGTH));
    setErrors((current) => ({ ...current, entry: undefined }));
  }

  return (
    <DialogContent size="lg">
      <DialogForm onSubmit={submit} className="grid min-w-0 gap-4 [&>*]:min-w-0" noValidate>
        <DialogHeader icon={Link2}>
          <DialogTitle>{item ? "Edit link" : "Add link"}</DialogTitle>
          <DialogDescription>
            Link to an entry to follow it when its URL changes, or to any web address.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="*:min-w-0">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Links to</legend>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              {(
                [
                  { value: "entry", label: "An entry", icon: FileText },
                  { value: "url", label: "A URL", icon: Globe },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className="hover:bg-accent/50 has-focus-visible:ring-ring/50 has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium has-focus-visible:ring-[3px]"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option.value}
                    checked={kind === option.value}
                    onChange={() => setKind(option.value)}
                    className="accent-primary size-4 shrink-0 outline-none"
                  />
                  <option.icon className="text-muted-foreground size-4" aria-hidden />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {kind === "entry" ? (
            <EntryChooser
              siteId={siteId}
              selected={entry}
              error={errors.entry}
              onPick={pick}
              onClear={() => setEntry(null)}
            />
          ) : (
            <FormField
              id="menu-item-url"
              label="URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              error={errors.url}
              hint="https://…, a path on your site like /pricing, mailto: or tel:."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}

          <FormField
            id="menu-item-label"
            label="Label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            error={errors.label}
            hint="The text visitors see in the menu."
            maxLength={MAX_LABEL_LENGTH}
            required
          />

          <div className="flex items-center justify-between gap-4">
            <label htmlFor="menu-item-new-tab" className="text-sm">
              <span className="block font-medium">Open in a new tab</span>
              <span className="text-muted-foreground block text-xs">
                Usually only for links to other websites.
              </span>
            </label>
            <Switch
              id="menu-item-new-tab"
              checked={openInNewTab}
              onCheckedChange={setOpenInNewTab}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit">{item ? "Update link" : "Add link"}</Button>
        </DialogFooter>
      </DialogForm>
    </DialogContent>
  );
}

function EntryChooser({
  siteId,
  selected,
  error,
  onPick,
  onClear,
}: {
  siteId: string;
  selected: { id: string; target: ItemFields["target"] } | null;
  error?: string;
  onPick: (target: LinkTarget) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTarget[] | null>(null);
  const [loading, startLoading] = useTransition();
  const searching = !selected;

  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(
      () =>
        startLoading(async () => setResults(await searchMenuTargetsAction(siteId, query.trim()))),
      results === null ? 0 : 250,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on query changes only
  }, [query, searching]);

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Entry</span>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {selected.target?.title || "Deleted entry"}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {selected.target
                ? `${selected.target.modelName} · ${selected.target.path}`
                : "Choose another entry for this link."}
            </span>
          </span>
          {selected.target && (
            <ContentStatusBadge status={selected.target.status as ContentStatus} />
          )}
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="menu-entry-search" className="text-sm font-medium">
        Entry <span className="text-muted-foreground font-normal">(required)</span>
      </label>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="menu-entry-search"
          type="search"
          placeholder="Search by title or slug"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "menu-entry-error" : undefined}
          autoComplete="off"
          autoFocus
        />
      </div>
      {error && (
        <p id="menu-entry-error" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div
        className={cn("max-h-56 min-h-24 overflow-y-auto rounded-lg border p-1")}
        aria-busy={loading}
      >
        {results === null ? (
          <p className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading entries…
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            {query.trim()
              ? `Nothing matches “${query.trim()}”.`
              : "No entries yet. Create one in Content first."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5" aria-label="Matching entries">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onPick(result)}
                  className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-[3px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {result.title || "Untitled"}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {result.modelName} · {result.path}
                    </span>
                  </span>
                  <ContentStatusBadge status={result.status as ContentStatus} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Unpublished entries can be added; they stay hidden on your site until published.
      </p>
    </div>
  );
}
