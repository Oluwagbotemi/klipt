"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Images, Loader2, Search, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { pickMediaAction, setAltTextAction } from "@/app/(site)/sites/[siteId]/media/actions";
import { MediaThumb } from "@/components/media/media-thumb";
import { UploadQueue } from "@/components/media/upload-queue";
import { useUploads } from "@/components/media/use-uploads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ALT_TEXT_MAX, type MediaAssetSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** Choose (or upload) an image from the media library and confirm its alt text. */
export function MediaPicker({
  open,
  onOpenChange,
  siteId,
  canUpload,
  onInsert,
  title = "Insert image",
  actionLabel = "Insert image",
}: {
  title?: string;
  actionLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  canUpload: boolean;
  onInsert: (asset: MediaAssetSummary, alt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaAssetSummary[] | null>(null);
  const [selected, setSelected] = useState<MediaAssetSummary | null>(null);
  const [alt, setAlt] = useState("");
  const [loading, startLoading] = useTransition();
  const [inserting, startInsert] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const choose = useCallback((asset: MediaAssetSummary) => {
    setSelected(asset);
    setAlt(asset.altText ?? "");
  }, []);

  const load = useCallback(
    (q: string) =>
      startLoading(async () => {
        const list = await pickMediaAction(siteId, { q });
        setItems(list?.items ?? []);
      }),
    [siteId],
  );

  const uploads = useUploads(
    siteId,
    useCallback(
      (asset: MediaAssetSummary) => {
        setItems((prev) => [asset, ...(prev ?? []).filter((item) => item.id !== asset.id)]);
        choose(asset);
      },
      [choose],
    ),
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load(query.trim()), items === null ? 0 : 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open and on query change
  }, [open, query, load]);

  function insert() {
    if (!selected) return;
    const text = alt.trim();
    startInsert(async () => {
      if (text !== (selected.altText ?? "")) {
        const saved = await setAltTextAction(siteId, selected.id, text);
        if (!saved.ok) toast.warning(`Inserted, but the alt text wasn't saved: ${saved.error}`);
      }
      onInsert(selected, text);
      setSelected(null);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelected(null);
      }}
    >
      <DialogContent size="lg">
        <DialogHeader icon={Images}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose from your media library, or upload a new image.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="picker-search" className="sr-only">
                Search images
              </label>
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="picker-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or alt text"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            {canUpload && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept={IMAGE_TYPES}
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    if (e.target.files?.length) void uploads.upload(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden />
                  Upload image
                </Button>
              </>
            )}
          </div>

          <UploadQueue items={uploads.items} onClear={uploads.clearFinished} />

          <div className="max-h-[45dvh] min-h-40 overflow-y-auto" aria-busy={loading || undefined}>
            {items === null ? (
              <p className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading images…
              </p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                {query
                  ? `No images match “${query}”.`
                  : "No images yet. Upload one to get started."}
              </p>
            ) : (
              <ul
                role="listbox"
                aria-label="Images"
                className="grid grid-cols-3 gap-2 sm:grid-cols-5"
              >
                {items.map((asset) => (
                  <li key={asset.id} role="option" aria-selected={selected?.id === asset.id}>
                    <button
                      type="button"
                      onClick={() => choose(asset)}
                      aria-label={
                        asset.altText ? `${asset.filename}: ${asset.altText}` : asset.filename
                      }
                      className={cn(
                        "focus-visible:ring-ring/50 relative block aspect-square w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-[3px]",
                        selected?.id === asset.id && "ring-primary ring-2 ring-offset-2",
                      )}
                    >
                      <MediaThumb asset={asset} eager />
                      {!asset.altText && (
                        <span className="bg-warning-soft text-warning absolute bottom-1 left-1 rounded p-0.5">
                          <TriangleAlert className="size-3" aria-hidden />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div className="flex flex-col gap-1.5 border-t pt-4">
              <label htmlFor="picker-alt" className="text-sm font-medium">
                Alt text for {selected.filename}
              </label>
              <Textarea
                id="picker-alt"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                maxLength={ALT_TEXT_MAX}
                rows={2}
                aria-describedby="picker-alt-hint"
                placeholder="Describe what the image shows"
              />
              <p id="picker-alt-hint" className="text-muted-foreground text-xs">
                {alt.trim()
                  ? "Saved to the image in your media library, so it's used everywhere."
                  : "Missing alt text. Add a short description unless the image is purely decorative."}
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={insert} disabled={!selected || inserting}>
            {inserting && <Loader2 className="animate-spin" aria-hidden />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
