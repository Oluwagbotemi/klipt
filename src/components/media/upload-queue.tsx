"use client";

import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { UploadItem } from "@/components/media/use-uploads";
import { Button } from "@/components/ui/button";

/** Per-file upload progress with the reason when one fails. */
export function UploadQueue({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  if (items.length === 0) return null;
  const finished = items.filter((item) => item.status === "done" || item.status === "failed");
  return (
    <section aria-label="Uploads" className="bg-card rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm font-medium" aria-live="polite">
          {finished.length === items.length
            ? `${items.filter((i) => i.status === "done").length} of ${items.length} uploaded`
            : `Uploading ${finished.length + 1} of ${items.length}…`}
        </p>
        {finished.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ul className="max-h-48 divide-y overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-2 text-sm">
            {item.status === "done" ? (
              <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
            ) : item.status === "failed" ? (
              <CircleX className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Loader2
                className="text-muted-foreground mt-0.5 size-4 shrink-0 animate-spin"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate">{item.name}</p>
              <p
                className={
                  item.status === "failed"
                    ? "text-destructive text-xs"
                    : "text-muted-foreground text-xs"
                }
              >
                {item.status === "preparing" && "Preparing…"}
                {item.status === "uploading" &&
                  (item.resized ? "Resized to fit · uploading…" : "Uploading…")}
                {item.status === "done" &&
                  (item.resized ? "Uploaded (resized to fit)" : "Uploaded")}
                {item.status === "failed" && item.error}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
