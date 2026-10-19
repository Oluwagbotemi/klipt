"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMediaAction,
  saveMediaDetailsAction,
  type MediaDetailsState,
} from "@/app/(site)/sites/[siteId]/media/actions";
import { CopyButton } from "@/components/copy-button";
import { InlineAlert } from "@/components/inline-alert";
import { MediaThumb } from "@/components/media/media-thumb";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS, type ContentStatus } from "@/lib/content";
import { formatDate } from "@/lib/format";
import {
  ALT_TEXT_MAX,
  CAPTION_MAX,
  formatBytes,
  isImageType,
  type MediaAssetSummary,
  type MediaUsage,
} from "@/lib/media";
import { siteHref } from "@/lib/navigation";

/** Side panel for one file: preview, alt text and caption, details, usage, delete. */
export function MediaDetailsSheet({
  siteId,
  asset,
  canManage,
  onClose,
}: {
  siteId: string;
  asset: (MediaAssetSummary & { usage: MediaUsage[] }) | null;
  canManage: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={asset !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        closeLabel="Close details"
        className="bg-background w-full max-w-md gap-0 overflow-y-auto sm:w-[28rem]"
      >
        {asset && (
          <Details
            key={asset.id}
            siteId={siteId}
            asset={asset}
            canManage={canManage}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Details({
  siteId,
  asset,
  canManage,
  onClose,
}: {
  siteId: string;
  asset: MediaAssetSummary & { usage: MediaUsage[] };
  canManage: boolean;
  onClose: () => void;
}) {
  const image = isImageType(asset.mimeType);
  const [state, formAction, pending] = useActionState(saveMediaDetailsAction, {
    values: { altText: asset.altText ?? "", caption: asset.caption ?? "" },
  } satisfies MediaDetailsState);
  const [alt, setAlt] = useState(state.values.altText);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const absoluteUrl =
    typeof window !== "undefined" && asset.url.startsWith("/")
      ? `${window.location.origin}${asset.url}`
      : asset.url;

  function remove(event: React.MouseEvent) {
    event.preventDefault();
    startDelete(async () => {
      const result = await deleteMediaAction(siteId, [asset.id]);
      if (result.deleted === 1) {
        toast.success(`Deleted ${asset.filename}.`);
        setConfirmDelete(false);
        onClose();
      } else {
        toast.error(result.error ?? "This file couldn't be deleted.");
      }
    });
  }

  return (
    <>
      <div className="border-b px-5 pt-5 pr-14 pb-4">
        <SheetTitle className="truncate text-base">{asset.filename}</SheetTitle>
        <SheetDescription>
          {image ? "Image" : "File"} · {formatBytes(asset.sizeBytes)}
          {asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ""}
        </SheetDescription>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="bg-muted flex max-h-72 items-center justify-center overflow-hidden rounded-xl border">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- files come from Blob/local storage
            <img
              src={asset.url}
              alt={asset.altText ?? ""}
              className="max-h-72 w-auto max-w-full object-contain"
            />
          ) : (
            <div className="size-32">
              <MediaThumb asset={asset} className="rounded-xl" />
            </div>
          )}
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="assetId" value={asset.id} />
          {image && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="media-alt" className="text-sm font-medium">
                Alt text
              </label>
              {!alt.trim() && (
                <p className="text-warning flex items-center gap-1.5 text-xs">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  Missing. Search engines and screen readers rely on it.
                </p>
              )}
              <Textarea
                id="media-alt"
                name="altText"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                maxLength={ALT_TEXT_MAX}
                rows={3}
                readOnly={!canManage}
                aria-invalid={state.errors?.altText ? true : undefined}
                aria-describedby="media-alt-hint"
                placeholder="e.g. A grey seal resting on a rock at low tide"
              />
              <p id="media-alt-hint" className="text-muted-foreground text-xs">
                Describe what the image shows for people who can&apos;t see it. Leave it empty only
                if the image is purely decorative. {alt.length}/{ALT_TEXT_MAX}
              </p>
              {state.errors?.altText && (
                <p className="text-destructive text-sm">{state.errors.altText}</p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="media-caption" className="text-sm font-medium">
              Caption <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="media-caption"
              name="caption"
              defaultValue={state.values.caption}
              maxLength={CAPTION_MAX}
              rows={2}
              readOnly={!canManage}
              aria-describedby="media-caption-hint"
            />
            <p id="media-caption-hint" className="text-muted-foreground text-xs">
              Shown to readers where your website displays captions, e.g. a photo credit.
            </p>
          </div>
          {canManage ? (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {pending ? "Saving…" : "Save"}
              </Button>
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {state.saved && !pending ? "Saved. Content using this image shows it now." : ""}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Only editors, admins and the person who uploaded this file can change it.
            </p>
          )}
        </form>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-4 text-sm">
          <dt className="text-muted-foreground">Uploaded</dt>
          <dd>
            {formatDate(asset.createdAt)}
            {asset.uploadedByName && ` by ${asset.uploadedByName}`}
          </dd>
          <dt className="text-muted-foreground">Type</dt>
          <dd>{asset.mimeType}</dd>
          <dt className="text-muted-foreground">URL</dt>
          <dd className="flex flex-col items-start gap-2">
            <code className="bg-muted w-full rounded px-2 py-1 font-mono text-xs break-all">
              {absoluteUrl}
            </code>
            <span className="flex gap-2">
              <CopyButton value={absoluteUrl} label="Copy URL" />
              <Button variant="ghost" size="sm" asChild>
                <a href={asset.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  Open
                </a>
              </Button>
            </span>
          </dd>
        </dl>

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium">Used in</h3>
          {asset.usage.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">Not used in any content yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {asset.usage.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link
                    href={`${siteHref(siteId, "content")}/${entry.id}`}
                    className="text-primary min-w-0 truncate underline-offset-4 hover:underline"
                  >
                    {entry.title || "Untitled"}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {STATUS_LABELS[entry.status as ContentStatus] ?? entry.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="border-t pt-4">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive -ml-3"
              onClick={() => setConfirmDelete(true)}
            >
              Delete file
            </Button>
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => !deleting && setConfirmDelete(open)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete {asset.filename}?</AlertDialogTitle>
          <AlertDialogDescription>
            {asset.usage.length > 0
              ? `It's used in ${asset.usage.length} ${asset.usage.length === 1 ? "entry" : "entries"}. The image will disappear from ${asset.usage.length === 1 ? "it" : "them"}, including any that are live. `
              : ""}
            The file is removed permanently and its URL stops working. This can&apos;t be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" aria-hidden />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
