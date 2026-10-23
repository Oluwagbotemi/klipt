"use client";

import Link from "next/link";
import { FileText, Image as ImageIcon, Loader2, Newspaper, Plug } from "lucide-react";
import { useCreateEntry } from "@/components/content/new-entry-button";
import { Button } from "@/components/ui/button";
import { siteHref } from "@/lib/navigation";

/** Shortcuts for the most common jobs as pills, limited to what the member can do. */
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
    pending ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />;

  if (!canCreate && !canUpload && !canIntegrate) return null;
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {canCreate && (
        <>
          <Button variant="ink" onClick={() => create("post")} disabled={pending}>
            {icon(Newspaper)}
            New post
          </Button>
          <Button variant="soft" onClick={() => create("page")} disabled={pending}>
            {icon(FileText)}
            New page
          </Button>
        </>
      )}
      {canUpload && (
        <Button variant="soft" asChild>
          <Link href={siteHref(siteId, "media")}>
            <ImageIcon aria-hidden />
            Upload media
          </Link>
        </Button>
      )}
      {canIntegrate && (
        <Button variant="soft" asChild>
          <Link href={siteHref(siteId, "settings", "integrations")}>
            <Plug aria-hidden />
            Connect website
          </Link>
        </Button>
      )}
    </nav>
  );
}

/** "Write a post" on the dark highlight card. */
export function HeroCreateButton({ siteId, className }: { siteId: string; className: string }) {
  const { create, pending } = useCreateEntry(siteId);
  return (
    <button type="button" className={className} onClick={() => create("post")} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Newspaper aria-hidden />}
      Write a post
    </button>
  );
}
