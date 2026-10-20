import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/permission-denied";
import { seoCard } from "@/components/seo/seo-parts";
import { VisibilitySwitch } from "@/components/seo/visibility-switch";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Crawling & indexing · SEO" };

export default async function IndexingPage({ params }: PageProps<"/sites/[siteId]/seo/indexing">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  const canManage = can(site.currentUserRole, "seo.manage");
  if (!canManage) {
    return (
      <PermissionDenied
        area="Crawling & indexing"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const report = await getSeoReport(site.id);
  const noindex = report.pages.filter((page) => page.issues.includes("noindex")).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <section aria-labelledby="visibility-heading" className={`${seoCard} p-5 sm:p-6`}>
        <h2 id="visibility-heading" className="text-base font-semibold">
          Search visibility
        </h2>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">
          A site-wide switch for sites that shouldn&apos;t be found yet, such as a staging copy.
        </p>
        <VisibilitySwitch
          siteId={site.id}
          allowIndexing={report.allowIndexing}
          canManage={canManage}
        />
      </section>

      <section aria-labelledby="pages-heading" className={`${seoCard} p-5 sm:p-6`}>
        <h2 id="pages-heading" className="text-base font-semibold">
          Page-level settings
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Each page can be set to noindex or nofollow, left out of the sitemap, or given a canonical
          URL under Advanced in the editor.{" "}
          {noindex > 0 ? (
            <Link
              href={`${siteHref(site.id, "seo", "pages")}?issue=noindex`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {noindex} live {noindex === 1 ? "page is" : "pages are"} set to noindex.
            </Link>
          ) : (
            "No live pages are set to noindex."
          )}
        </p>
      </section>

      <section aria-labelledby="robots-heading" className={`${seoCard} p-5 sm:p-6`}>
        <h2 id="robots-heading" className="text-base font-semibold">
          robots.txt
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Your website serves its own <code className="font-mono">robots.txt</code>. A typical one
          allows crawling and points to your sitemap:
        </p>
        <pre className="bg-muted mt-3 overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-xs">
          {`User-agent: *\nAllow: /\n\nSitemap: ${report.domain ? `https://${report.domain}` : "https://your-site.example"}/sitemap.xml`}
        </pre>
        <p className="text-muted-foreground mt-3 text-xs">
          Blocking a page in robots.txt stops crawling but doesn&apos;t remove it from search
          results; use noindex for that.
        </p>
      </section>
    </div>
  );
}
