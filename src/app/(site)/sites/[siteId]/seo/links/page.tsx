import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Unlink } from "lucide-react";
import { TruncatedNote, seoCard } from "@/components/seo/seo-parts";
import { Button } from "@/components/ui/button";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Internal links · SEO" };

export default async function SeoLinksPage({ params }: PageProps<"/sites/[siteId]/seo/links">) {
  const { siteId } = await params;
  const [site, report] = await Promise.all([getSite(siteId), getSeoReport(siteId)]);
  const canRedirect = can(site.currentUserRole, "seo.manage");
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;
  const redirectHref = (from: string) =>
    `${siteHref(site.id, "seo", "redirects")}?new=${encodeURIComponent(from)}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
      <section aria-labelledby="broken-heading" className={seoCard}>
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 id="broken-heading" className="text-base font-semibold">
            Broken links{" "}
            <span className="text-muted-foreground font-normal">({report.broken.length})</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Links in live pages to addresses on your site where nothing is published and no redirect
            exists. Fix the link in the page, or redirect the address.
          </p>
        </div>
        {report.broken.length === 0 ? (
          <p className="flex items-center gap-2 border-t px-5 py-6 text-sm sm:px-6">
            <CircleCheck className="text-success size-5" aria-hidden />
            {report.pages.length === 0
              ? "Nothing to check yet."
              : "No broken internal links found."}
          </p>
        ) : (
          <ul className="divide-y border-t" aria-label="Broken links">
            {report.broken.map((item) => (
              <li
                key={`${item.id}-${item.href}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6"
              >
                <Unlink className="text-destructive size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-mono text-sm">{item.href}</p>
                  <p className="text-muted-foreground truncate text-xs">On {item.title}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={entryHref(item.id)}>Edit page</Link>
                  </Button>
                  {canRedirect && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={redirectHref(item.href)}>Add redirect</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orphans-heading" className={seoCard}>
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 id="orphans-heading" className="text-base font-semibold">
            Pages nothing links to{" "}
            <span className="text-muted-foreground font-normal">({report.orphans.length})</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            No other live page links here, so readers and crawlers may not find them. Your home
            page, and pages linked from your website&apos;s menus, are usually fine.
          </p>
        </div>
        {report.orphans.length === 0 ? (
          <p className="text-muted-foreground border-t px-5 py-6 text-sm sm:px-6">
            {report.pages.length === 0
              ? "Nothing to check yet."
              : "Every live page is linked from another."}
          </p>
        ) : (
          <ul className="divide-y border-t" aria-label="Pages nothing links to">
            {report.orphans.map((page) => (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 block px-5 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <span className="block truncate text-sm font-medium">{page.title}</span>
                  <span className="text-muted-foreground block truncate font-mono text-xs">
                    {page.path}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
