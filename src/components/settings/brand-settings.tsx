"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { setBrandImageAction } from "@/app/(site)/sites/[siteId]/settings/actions";
import { InlineAlert } from "@/components/inline-alert";
import { MediaPicker } from "@/components/media/media-picker";
import { UploadQueue } from "@/components/media/upload-queue";
import { useUploads } from "@/components/media/use-uploads";
import { Button } from "@/components/ui/button";
import {
  BRAND_LABELS,
  brandImageError,
  brandImageNote,
  FAVICON_IDEAL_PX,
  type BrandImage,
  type BrandSlot,
  type SiteBranding,
} from "@/lib/branding";
import type { MediaAssetSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

const ACCEPT: Record<BrandSlot, string> = {
  logo: "image/png,image/jpeg,image/webp,image/gif,image/avif",
  favicon: "image/png,image/webp",
};

const HINTS: Record<BrandSlot, string> = {
  logo: "Shown on your site's tile in Klipt and returned by the content API. A transparent PNG works best.",
  favicon: `The small icon in browser tabs. A square PNG, ideally ${FAVICON_IDEAL_PX} × ${FAVICON_IDEAL_PX} pixels.`,
};

/**
 * Settings › General › Brand: the logo and favicon. Each change (upload, choose,
 * remove) saves straight away and says so in a toast; the files live in the
 * media library, so removing one here never deletes it.
 */
export function BrandSettings({
  siteId,
  siteName,
  initial,
  canUpload,
}: {
  siteId: string;
  siteName: string;
  initial: SiteBranding;
  canUpload: boolean;
}) {
  const [branding, setBranding] = useState(initial);
  return (
    <div className="flex flex-1 flex-col gap-6">
      {(["logo", "favicon"] as const).map((slot) => (
        <BrandSlotField
          key={slot}
          slot={slot}
          siteId={siteId}
          siteName={siteName}
          image={branding[slot]}
          canUpload={canUpload}
          onSaved={setBranding}
        />
      ))}
    </div>
  );
}

function BrandSlotField({
  slot,
  siteId,
  siteName,
  image,
  canUpload,
  onSaved,
}: {
  slot: BrandSlot;
  siteId: string;
  siteName: string;
  image: BrandImage | null;
  canUpload: boolean;
  onSaved: (branding: SiteBranding) => void;
}) {
  const label = BRAND_LABELS[slot];
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useCallback(
    (mediaId: string | null) =>
      startSaving(async () => {
        const result = await setBrandImageAction(siteId, slot, mediaId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        onSaved(result.branding);
        toast.success(
          mediaId
            ? `${label} saved. It's in your media library too.`
            : `${label} removed. The file is still in your media library.`,
        );
      }),
    [siteId, slot, label, onSaved],
  );

  const use = useCallback(
    (asset: MediaAssetSummary) => {
      const problem = brandImageError(slot, asset);
      if (problem) {
        setError(problem);
        return;
      }
      save(asset.id);
    },
    [slot, save],
  );

  const uploads = useUploads(siteId, use);
  const busy = saving || uploads.busy;
  const note = brandImageNote(slot, image);
  const id = `brand-${slot}`;

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={`${id}-label`}>
      <div>
        <p id={`${id}-label`} className="text-sm font-medium">
          {slot === "logo" ? "Logo" : "Favicon"}
        </p>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {HINTS[slot]}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {slot === "logo" ? (
          <div className="flex gap-2">
            <Preview image={image} siteName={siteName} tone="light" wide />
            <Preview image={image} siteName={siteName} tone="dark" wide />
          </div>
        ) : (
          <Preview image={image} siteName={siteName} tone="light" />
        )}
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT[slot]}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const files = event.target.files;
                  if (files?.length) {
                    setError(null);
                    void uploads.upload([files[0]]);
                  }
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                aria-label={`Upload ${label.toLowerCase()}`}
              >
                <Upload aria-hidden />
                Upload
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setPicking(true)}
            aria-label={`Choose ${label.toLowerCase()} from library`}
          >
            <ImageIcon aria-hidden />
            Choose from library
          </Button>
          {image && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => save(null)}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              <X aria-hidden />
              Remove
            </Button>
          )}
          {saving && (
            <Loader2
              className="text-muted-foreground size-4 animate-spin self-center"
              aria-hidden
            />
          )}
        </div>
      </div>

      {image && (
        <p className="text-muted-foreground text-xs">
          {image.width && image.height ? `${image.width} × ${image.height} px` : "Image"}
          {note && <span className="text-warning-strong"> · {note}</span>}
        </p>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
      <UploadQueue items={uploads.items} onClear={uploads.clearFinished} />

      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        siteId={siteId}
        canUpload={canUpload}
        title={slot === "logo" ? "Choose a logo" : "Choose a favicon"}
        actionLabel={slot === "logo" ? "Use as logo" : "Use as favicon"}
        onInsert={(asset) => {
          setPicking(false);
          setError(null);
          use(asset);
        }}
      />
    </div>
  );
}

/** The image on a hatched ground, so transparent areas show; the logo also on dark. */
function Preview({
  image,
  siteName,
  tone,
  wide,
}: {
  image: BrandImage | null;
  siteName: string;
  tone: "light" | "dark";
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "visual-hatch grid shrink-0 place-items-center overflow-hidden rounded-xl border p-2",
        wide ? "h-20 w-36" : "size-20",
        tone === "dark" ? "bg-hero border-hero-border" : "bg-background",
      )}
      data-brand-preview={tone}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- media library file
        <img
          src={image.url}
          alt={
            tone === "light" ? (image.altText ?? `${siteName} ${wide ? "logo" : "favicon"}`) : ""
          }
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <span className="text-muted-foreground text-xs">None</span>
      )}
    </div>
  );
}
