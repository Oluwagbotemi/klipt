import Link from "next/link";
import { EyeOff } from "lucide-react";
import { siteHref } from "@/lib/navigation";

export const seoCard = "visual-card";

/** Shown on SEO pages while the whole site is hidden from search engines. */
export function SiteHiddenNotice({ siteId, canManage }: { siteId: string; canManage: boolean }) {
  return (
    <div
      role="status"
      className="border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm"
    >
      <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Search engines are asked not to index this site.</span> Every
        page is sent as noindex and the sitemap is empty.
      </p>
      {canManage && (
        <Link
          href={siteHref(siteId, "seo", "indexing")}
          className="font-medium underline underline-offset-4"
        >
          Change
        </Link>
      )}
    </div>
  );
}

export function TruncatedNote({ shown }: { shown: number }) {
  return (
    <p className="text-muted-foreground text-xs">
      Checked the {shown} most recently published pages.
    </p>
  );
}
