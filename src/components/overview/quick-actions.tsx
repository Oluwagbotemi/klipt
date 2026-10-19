"use client";

import Link from "next/link";
import { FileText, Image as ImageIcon, Loader2, Newspaper, Plug } from "lucide-react";
import { useCreateEntry } from "@/components/content/new-entry-button";
import { siteHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const tile =
  "bg-card hover:bg-accent/50 focus-visible:ring-ring/50 flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-60";

/** Shortcuts for the most common jobs, limited to what the member can do. */
export function QuickActions({
  siteId,
  canCreate,
  canUpload,
  canIntegrate,
}: {
  siteId: string;
  canCreate: boolean;
  canUpload: boolean;
  canIntegrate: boolean;
}) {
  const { create, pending } = useCreateEntry(siteId);
  const icon = (Icon: typeof FileText) =>
    pending ? (
      <Loader2 className="text-primary size-5 animate-spin" aria-hidden />
    ) : (
      <Icon className="text-primary size-5" aria-hidden />
    );

  return (
    <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {canCreate && (
        <>
          <button type="button" className={tile} onClick={() => create("post")} disabled={pending}>
            {icon(Newspaper)}
            New post
          </button>
          <button type="button" className={tile} onClick={() => create("page")} disabled={pending}>
            {icon(FileText)}
            New page
          </button>
        </>
      )}
      {canUpload && (
        <Link href={siteHref(siteId, "media")} className={tile}>
          <ImageIcon className="text-primary size-5" aria-hidden />
          Upload media
        </Link>
      )}
      {canIntegrate && (
        <Link href={siteHref(siteId, "settings", "integrations")} className={cn(tile)}>
          <Plug className="text-primary size-5" aria-hidden />
          Connect website
        </Link>
      )}
    </nav>
  );
}
