"use client";

import { useActionState, useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import {
  saveDomainAction,
  saveGeneralAction,
  saveSeoDefaultsAction,
  type FormState,
  type GeneralValues,
  type SeoDefaultValues,
} from "@/app/(site)/sites/[siteId]/settings/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { MediaPicker } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import { LANGUAGES, applyTitleTemplate } from "@/lib/site-settings";

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

function SaveRow({
  pending,
  saved,
  label = "Save",
}: {
  pending: boolean;
  saved?: boolean;
  label?: string;
}) {
  return (
    <div className="border-card-border mt-auto flex items-center gap-3 border-t pt-4">
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : label}
      </Button>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {saved && !pending ? "Saved." : ""}
      </p>
    </div>
  );
}

export function GeneralForm({
  siteId,
  initial,
  timeZones,
}: {
  siteId: string;
  initial: GeneralValues;
  timeZones: string[];
}) {
  const [state, formAction, pending] = useActionState(saveGeneralAction, {
    values: initial,
  } satisfies FormState<GeneralValues>);
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />
      <FormField
        id="site-name"
        name="name"
        label="Site name"
        defaultValue={state.values.name}
        error={state.errors?.name}
        hint="Shown to your team in Klipt and returned by the content API."
        maxLength={80}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-language" className="text-sm font-medium">
          Language
        </label>
        <select
          id="site-language"
          name="language"
          defaultValue={state.values.language}
          className={selectClass}
          aria-describedby="site-language-hint"
        >
          {LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label} ({code})
            </option>
          ))}
        </select>
        <p id="site-language-hint" className="text-muted-foreground text-xs">
          The main language of your content. Your website can use it for the page&apos;s{" "}
          <code className="font-mono">lang</code> attribute.
        </p>
        {state.errors?.language && (
          <p className="text-destructive text-sm">{state.errors.language}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-timezone" className="text-sm font-medium">
          Time zone
        </label>
        <select
          id="site-timezone"
          name="timezone"
          defaultValue={state.values.timezone}
          className={selectClass}
          aria-describedby="site-timezone-hint"
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p id="site-timezone-hint" className="text-muted-foreground text-xs">
          Your site&apos;s home time zone, returned by the content API.
        </p>
        {state.errors?.timezone && (
          <p className="text-destructive text-sm">{state.errors.timezone}</p>
        )}
      </div>
      <SaveRow pending={pending} saved={state.saved} />
    </form>
  );
}

export function DomainForm({ siteId, domain }: { siteId: string; domain: string | null }) {
  const [state, formAction, pending] = useActionState(saveDomainAction, {
    values: { domain: domain ?? "" },
  } satisfies FormState<{ domain: string }>);
  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />
      <FormField
        id="site-domain"
        name="domain"
        label="Website address"
        defaultValue={state.values.domain}
        error={state.errors?.domain}
        hint="For example blog.example.com. Leave empty if your website doesn't have one yet."
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
      />
      <SaveRow pending={pending} saved={state.saved} />
    </form>
  );
}

export function SeoDefaultsForm({
  siteId,
  siteName,
  titleTemplate,
  ogImage,
  canUpload,
}: {
  siteId: string;
  siteName: string;
  titleTemplate: string | null;
  ogImage: { id: string; url: string; altText: string | null } | null;
  canUpload: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveSeoDefaultsAction, {
    values: { titleTemplate: titleTemplate ?? "", ogImageId: ogImage?.id ?? "" },
  } satisfies FormState<SeoDefaultValues>);
  const [template, setTemplate] = useState(state.values.titleTemplate);
  const [image, setImage] = useState(ogImage);
  const [picking, setPicking] = useState(false);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="ogImageId" value={image?.id ?? ""} />
      <div className="flex flex-col gap-1.5">
        <FormField
          id="title-template"
          name="titleTemplate"
          label="Title template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          error={state.errors?.titleTemplate}
          placeholder={`%s | ${siteName}`}
          hint={
            <>
              <code className="font-mono">%s</code> is replaced by each page&apos;s SEO title.
              Preview:{" "}
              <span className="text-foreground">
                {applyTitleTemplate(
                  template.includes("%s") ? template : undefined,
                  "Why the harbour seals came back",
                )}
              </span>
            </>
          }
          maxLength={120}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" id="og-image-label">
          Default sharing image{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </p>
        {image ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- media library file */}
            <img
              src={image.url}
              alt={image.altText ?? ""}
              className="bg-muted h-24 w-44 rounded-lg border object-cover"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                Change
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)}>
                <X aria-hidden />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPicking(true)}
              aria-describedby="og-image-hint"
            >
              <ImageIcon aria-hidden />
              Choose image
            </Button>
          </div>
        )}
        <p id="og-image-hint" className="text-muted-foreground text-xs">
          Shown when a page is shared on social media and has no image of its own. About 1200 × 630
          pixels works well.
        </p>
      </div>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        siteId={siteId}
        canUpload={canUpload}
        title="Choose a sharing image"
        actionLabel="Use this image"
        onInsert={(asset, alt) => {
          setImage({ id: asset.id, url: asset.url, altText: alt });
          setPicking(false);
        }}
      />
      <SaveRow pending={pending} saved={state.saved} />
    </form>
  );
}
