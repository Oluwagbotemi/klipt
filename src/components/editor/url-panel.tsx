"use client";

import { useState, useTransition } from "react";
import { Loader2, TriangleAlert, Wand2 } from "lucide-react";
import { SettingsSection } from "@/components/editor/settings-section";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/content";
import { SLUG_PATTERN, entryPath } from "@/lib/seo";

/**
 * URL slug. Unpublished entries change URL directly. For content that has
 * been published, the change is previewed with its impact and a 301 redirect
 * from the old URL is offered (on by default).
 */
export function UrlPanel({
  modelKey,
  slug,
  title,
  domain,
  hasBeenPublished,
  readOnly,
  onApply,
}: {
  modelKey: string;
  slug: string;
  title: string;
  domain: string | null;
  hasBeenPublished: boolean;
  readOnly: boolean;
  onApply: (slug: string, createRedirect: boolean) => Promise<string | null>;
}) {
  const [value, setValue] = useState(slug);
  const [redirect, setRedirect] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncedSlug, setSyncedSlug] = useState(slug);
  if (slug !== syncedSlug) {
    setSyncedSlug(slug);
    setValue(slug);
  }

  const next = value.trim().toLowerCase();
  const changed = next !== slug;
  const valid = SLUG_PATTERN.test(next) && next.length <= 80;
  const prefix = entryPath(modelKey, "");
  const oldPath = entryPath(modelKey, slug);
  const newPath = entryPath(modelKey, next || "…");

  function apply() {
    if (!valid) {
      setError("Use lowercase letters, numbers and single hyphens, e.g. spring-sale.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const failure = await onApply(next, hasBeenPublished && redirect);
      if (failure) setError(failure);
    });
  }

  return (
    <SettingsSection title="URL" description={domain ? `${domain}${oldPath}` : oldPath}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="entry-slug" className="text-sm font-medium">
          URL slug
        </label>
        <div className="flex items-center gap-2">
          <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-10 min-w-0 flex-1 items-center rounded-lg border focus-within:ring-[3px]">
            <span className="text-muted-foreground shrink-0 pl-3 font-mono text-sm" aria-hidden>
              {prefix}
            </span>
            <input
              id="entry-slug"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && changed) {
                  e.preventDefault();
                  apply();
                }
              }}
              disabled={readOnly || pending}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby="entry-slug-help"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none disabled:opacity-60"
            />
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Generate slug from title"
              title="Generate from title"
              onClick={() => setValue(slugify(title))}
              disabled={pending}
            >
              <Wand2 aria-hidden />
            </Button>
          )}
        </div>
        {error ? (
          <p id="entry-slug-help" className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : (
          <p id="entry-slug-help" className="text-muted-foreground text-xs">
            Short and readable, in lowercase with hyphens.
          </p>
        )}
      </div>

      {changed && !readOnly && (
        <div className="flex flex-col gap-3">
          {hasBeenPublished && (
            <div className="border-warning/40 bg-warning-soft flex flex-col gap-3 rounded-lg border p-3 text-sm">
              <p className="flex gap-2">
                <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This content has been published at{" "}
                  <span className="font-mono break-all">{oldPath}</span>. Changing the URL breaks
                  existing links and search results unless you redirect it.
                </span>
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={redirect}
                  onChange={(e) => setRedirect(e.target.checked)}
                  className="accent-primary mt-1 size-4"
                />
                <span>
                  Redirect <span className="font-mono break-all">{oldPath}</span> to{" "}
                  <span className="font-mono break-all">{newPath}</span> (301, recommended)
                </span>
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Change URL
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(slug);
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
