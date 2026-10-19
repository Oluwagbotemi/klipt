import { FileText } from "lucide-react";
import { isImageType, type MediaAssetSummary } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Square preview: the image itself, or a file icon. Decorative; the name is shown next to it. */
export function MediaThumb({
  asset,
  className,
  eager,
}: {
  asset: Pick<MediaAssetSummary, "url" | "mimeType">;
  className?: string;
  /** Load right away (e.g. inside a dialog, where lazy loading may not start). */
  eager?: boolean;
}) {
  if (isImageType(asset.mimeType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- files come from Blob/local storage
      <img
        src={asset.url}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("bg-muted size-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex size-full flex-col items-center justify-center gap-1",
        className,
      )}
    >
      <FileText className="size-6" aria-hidden />
      <span className="text-[0.625rem] font-semibold tracking-wider uppercase">
        {asset.mimeType.split("/")[1]}
      </span>
    </span>
  );
}
