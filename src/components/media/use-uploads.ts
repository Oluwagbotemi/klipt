"use client";

import { useCallback, useState } from "react";
import { uploadMediaAction } from "@/app/(site)/sites/[siteId]/media/actions";
import { prepareUpload } from "@/components/media/prepare-upload";
import type { MediaAssetSummary } from "@/lib/media";

export interface UploadItem {
  id: string;
  name: string;
  status: "preparing" | "uploading" | "done" | "failed";
  error?: string;
  resized?: boolean;
  asset?: MediaAssetSummary;
}

/** Uploads files one after another, tracking each file's state for display. */
export function useUploads(siteId: string, onUploaded?: (asset: MediaAssetSummary) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const busy = items.some((item) => item.status === "preparing" || item.status === "uploading");

  const update = (id: string, changes: Partial<UploadItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const queued = Array.from(files).map((file) => ({
        file,
        item: {
          id: crypto.randomUUID(),
          name: file.name,
          status: "preparing" as const,
        } satisfies UploadItem,
      }));
      setItems((prev) => [...queued.map((q) => q.item), ...prev].slice(0, 30));
      for (const { file, item } of queued) {
        const prepared = await prepareUpload(file);
        if (!prepared.ok) {
          update(item.id, { status: "failed", error: prepared.error });
          continue;
        }
        update(item.id, { status: "uploading", resized: prepared.resized });
        const form = new FormData();
        form.set("siteId", siteId);
        form.set("file", prepared.file);
        try {
          const result = await uploadMediaAction(form);
          if (result.ok) {
            update(item.id, { status: "done", asset: result.asset });
            onUploaded?.(result.asset);
          } else {
            update(item.id, { status: "failed", error: result.error });
          }
        } catch {
          update(item.id, { status: "failed", error: "The upload didn't finish. Try again." });
        }
      }
    },
    [siteId, onUploaded],
  );

  const clearFinished = () =>
    setItems((prev) =>
      prev.filter((item) => item.status === "preparing" || item.status === "uploading"),
    );

  return { items, busy, upload, clearFinished };
}
