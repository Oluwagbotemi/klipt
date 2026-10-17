"use client";

import { useState } from "react";
import { CircleCheck, Image as ImageIcon, Info, TriangleAlert } from "lucide-react";
import { LengthHint, SettingsSection } from "@/components/editor/settings-section";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SEO_GUIDANCE, resolveSeo, type EntrySeoInput } from "@/lib/seo";
import { cn } from "@/lib/utils";

const CANONICAL = /^https?:\/\/[^\s]+$/i;

type SeoProps = {
  seo: EntrySeoInput;
  onChange: (patch: Partial<EntrySeoInput>) => void;
  title: string;
  path: string;
  domain: string | null;
  words: number;
  readOnly: boolean;
};

function displayUrl(domain: string | null, path: string) {
  const host = domain ?? "your-site.example";
  return [host, ...path.split("/").filter(Boolean)].join(" › ");
}

/** Recommendations shown in the panel and before publishing. Never blocking. */
export function seoChecks({
  title,
  seo,
  words,
}: {
  title: string;
  seo: EntrySeoInput;
  words: number;
}) {
  const effective = resolveSeo(seo, title || "Untitled");
  return [
    { ok: title.trim().length > 0, text: "The page has a title" },
    {
      ok: effective.title.length <= SEO_GUIDANCE.title.max,
      text: `SEO title is about ${SEO_GUIDANCE.title.max} characters or fewer`,
    },
    { ok: effective.description.length > 0, text: "Meta description is written" },
    { ok: words >= 50, text: "Body has at least a short paragraph of text" },
    { ok: effective.index, text: "Search engines are allowed to index it" },
  ];
}

/** SEO title, description, search preview and recommendations. */
export function SearchPanel({ seo, onChange, title, path, domain, words, readOnly }: SeoProps) {
  const effective = resolveSeo(seo, title || "Untitled");
  const checks = seoChecks({ title, seo, words });

  return (
    <SettingsSection title="Search engines" description="How this page may appear in search">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seo-title" className="text-sm font-medium">
          SEO title
        </label>
        <Input
          id="seo-title"
          value={seo.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={title || "Uses the page title"}
          maxLength={200}
          disabled={readOnly}
          aria-describedby="seo-title-hint"
        />
        <LengthHint
          id="seo-title-hint"
          length={(seo.title ?? "").length}
          {...SEO_GUIDANCE.title}
          fallback="Empty: the page title is used."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seo-description" className="text-sm font-medium">
          Meta description
        </label>
        <Textarea
          id="seo-description"
          value={seo.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="A short summary that may appear under the title in search results"
          maxLength={500}
          rows={3}
          disabled={readOnly}
          aria-describedby="seo-description-hint"
        />
        <LengthHint
          id="seo-description-hint"
          length={(seo.description ?? "").length}
          {...SEO_GUIDANCE.description}
          fallback="Empty: search engines will choose text from the page."
        />
      </div>

      <figure className="flex flex-col gap-1.5">
        <figcaption className="text-muted-foreground text-xs font-medium">
          Search result preview
        </figcaption>
        <div className="bg-background rounded-lg border p-3">
          <p className="text-muted-foreground truncate text-xs">{displayUrl(domain, path)}</p>
          <p className="text-primary mt-0.5 line-clamp-2 text-base leading-snug">
            {effective.title}
          </p>
          <p
            className={cn(
              "mt-1 line-clamp-2 text-sm",
              effective.description ? "text-muted-foreground" : "text-muted-foreground italic",
            )}
          >
            {effective.description || "No description yet."}
          </p>
          {!effective.index && (
            <p className="text-warning mt-2 text-xs">
              Set to noindex: this page asks not to appear in results.
            </p>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          An approximation. Search engines decide how results look and may rewrite them.
        </p>
      </figure>

      <div>
        <h3 className="text-sm font-medium">Recommendations</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {checks.map((check) => (
            <li key={check.text} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span className={check.ok ? undefined : "text-muted-foreground"}>
                <span className="sr-only">{check.ok ? "Done: " : "Suggestion: "}</span>
                {check.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2 text-xs">
          Suggestions only. They never block publishing and don&apos;t guarantee rankings.
        </p>
      </div>
    </SettingsSection>
  );
}

/** Open Graph title/description with a link-card preview. */
export function SocialPanel({ seo, onChange, title, domain, readOnly }: SeoProps) {
  const effective = resolveSeo(seo, title || "Untitled");
  return (
    <SettingsSection
      title="Social sharing"
      description="When the link is shared"
      defaultOpen={false}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="og-title" className="text-sm font-medium">
          Share title
        </label>
        <Input
          id="og-title"
          value={seo.ogTitle ?? ""}
          onChange={(e) => onChange({ ogTitle: e.target.value })}
          placeholder={effective.title}
          maxLength={200}
          disabled={readOnly}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="og-description" className="text-sm font-medium">
          Share description
        </label>
        <Textarea
          id="og-description"
          value={seo.ogDescription ?? ""}
          onChange={(e) => onChange({ ogDescription: e.target.value })}
          placeholder={effective.description || "Uses the meta description"}
          maxLength={500}
          rows={2}
          disabled={readOnly}
        />
      </div>
      <figure className="flex flex-col gap-1.5">
        <figcaption className="text-muted-foreground text-xs font-medium">Link preview</figcaption>
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-muted text-muted-foreground flex aspect-[1.91/1] flex-col items-center justify-center gap-1 text-xs">
            <ImageIcon className="size-5" aria-hidden />
            Share image arrives with the Media library
          </div>
          <div className="bg-background p-3">
            <p className="text-muted-foreground text-xs uppercase">
              {domain ?? "your-site.example"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{effective.ogTitle}</p>
            {effective.ogDescription && (
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                {effective.ogDescription}
              </p>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Approximate. Each network shows shared links in its own way.
        </p>
      </figure>
    </SettingsSection>
  );
}

/** Canonical URL, robots directives, sitemap inclusion and structured data type. */
export function AdvancedPanel({
  seo,
  onChange,
  readOnly,
  schemaType,
  modelName,
}: Pick<SeoProps, "seo" | "onChange" | "readOnly"> & {
  schemaType: string | null;
  modelName: string;
}) {
  // The input keeps whatever is typed; only valid values (or empty) are saved.
  const [canonical, setCanonical] = useState(seo.canonicalUrl ?? "");
  const canonicalError =
    canonical.trim() !== "" && !CANONICAL.test(canonical.trim())
      ? "Enter a full URL starting with https://. Until then, the previous value is kept."
      : null;
  const effective = resolveSeo(seo, "");

  return (
    <SettingsSection
      title="Advanced"
      description="Canonical URL, indexing and structured data"
      defaultOpen={false}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seo-canonical" className="text-sm font-medium">
          Canonical URL
        </label>
        <Input
          id="seo-canonical"
          value={canonical}
          onChange={(e) => {
            setCanonical(e.target.value);
            const value = e.target.value.trim();
            if (value === "" || CANONICAL.test(value)) onChange({ canonicalUrl: value });
          }}
          placeholder="Leave empty to use this page's own URL"
          inputMode="url"
          spellCheck={false}
          disabled={readOnly}
          aria-invalid={canonicalError ? true : undefined}
          aria-describedby="seo-canonical-help"
        />
        <p
          id="seo-canonical-help"
          className={cn("text-xs", canonicalError ? "text-destructive" : "text-muted-foreground")}
        >
          {canonicalError ??
            "Only set this if the same content lives at another URL that should rank instead."}
        </p>
      </div>

      <ToggleRow
        id="seo-index"
        label="Allow search engines to index this page"
        checked={effective.index}
        onChange={(index) => onChange({ index })}
        disabled={readOnly}
      />
      {!effective.index && (
        <p className="border-warning/40 bg-warning-soft flex gap-2 rounded-lg border p-3 text-sm">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          Search engines will be asked not to show this page in results, and it leaves the sitemap.
          Use this for thank-you pages, internal pages or duplicates.
        </p>
      )}
      <ToggleRow
        id="seo-follow"
        label="Let search engines follow links on this page"
        checked={effective.follow}
        onChange={(follow) => onChange({ follow })}
        disabled={readOnly}
      />
      <ToggleRow
        id="seo-sitemap"
        label="Include in the sitemap"
        description={effective.index ? undefined : "Not available while indexing is off."}
        checked={effective.includeInSitemap}
        onChange={(includeInSitemap) => onChange({ includeInSitemap })}
        disabled={readOnly || !effective.index}
      />

      <div className="text-sm">
        <p className="font-medium">Structured data</p>
        <p className="text-muted-foreground mt-1">
          {schemaType
            ? `Uses the schema.org type ${schemaType}, set by the ${modelName} content model. Field mapping comes with Content models.`
            : "No schema.org type is set for this content model."}
        </p>
      </div>
    </SettingsSection>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="text-sm">
        {label}
        {description && <span className="text-muted-foreground block text-xs">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
