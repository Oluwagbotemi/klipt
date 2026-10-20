import Link from "next/link";
import { EyeOff } from "lucide-react";
import { siteHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const seoCard = "bg-card rounded-2xl border";

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

export function StatTile({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </>
  );
  const className = cn(seoCard, "flex h-full flex-col gap-1 p-4");
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-accent/40 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function TruncatedNote({ shown }: { shown: number }) {
  return (
    <p className="text-muted-foreground text-xs">
      Checked the {shown} most recently published pages.
    </p>
  );
}
