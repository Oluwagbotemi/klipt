"use client";

import { useActionState } from "react";
import { Eye, Loader2 } from "lucide-react";
import {
  savePreviewUrlAction,
  type PreviewUrlState,
} from "@/app/(site)/sites/[siteId]/settings/integrations/preview-actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";

/** Where the editor's Preview button sends people: the site's own website, or Klipt. */
export function PreviewSettings({
  siteId,
  previewUrl,
}: {
  siteId: string;
  previewUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(savePreviewUrlAction, {
    values: { previewUrl: previewUrl ?? "" },
  } satisfies PreviewUrlState);
  const active = state.saved ? state.values.previewUrl !== "" : Boolean(previewUrl);

  return (
    <section
      aria-labelledby="previews-heading"
      className="visual-card flex flex-col gap-5 p-5 sm:p-6 lg:grid lg:grid-cols-3 lg:gap-8"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-primary-soft text-primary-strong grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <Eye className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 id="previews-heading" className="text-base font-semibold">
            Draft previews
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Let the editor&apos;s <span className="font-medium">Preview</span> button open drafts on
            your own website, in your real design. Klipt sends the editor to the address below with
            a private link that works for one hour; your website swaps it for the draft using its
            API key.
          </p>
          <p className="mt-2 text-sm">
            {active ? (
              <span className="text-success-strong font-medium">
                On: Preview opens your website.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Off: Preview shows a plain version inside Klipt.
              </span>
            )}
          </p>
        </div>
      </div>
      <form action={formAction} className="flex w-full max-w-xl flex-col gap-4 lg:col-span-2">
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        <FormField
          id="preview-url"
          name="previewUrl"
          label="Preview address"
          type="url"
          inputMode="url"
          defaultValue={state.values.previewUrl}
          error={state.errors?.previewUrl}
          placeholder="https://myblog.com/api/preview"
          hint="A page or route on your website that turns on its draft mode. Klipt adds token, type, slug and path to it. Leave empty to use Klipt's built-in preview."
          autoComplete="off"
          spellCheck={false}
        />
        <div className="border-card-border flex items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : "Save"}
          </Button>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {state.saved && !pending ? "Saved." : ""}
          </p>
        </div>
      </form>
    </section>
  );
}
