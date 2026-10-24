import type { Metadata } from "next";
import Link from "next/link";
import { Bot, FileCog, Radar } from "lucide-react";
import { PermissionDenied } from "@/components/permission-denied";
import { CardContent, CardHeader, VisualCard } from "@/components/visual/card";
import { InfoChip } from "@/components/visual/info-chip";
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
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <VisualCard aria-labelledby="visibility-heading">
        <CardHeader
          id="visibility-heading"
          title="Search visibility"
          description="A site-wide switch for sites that shouldn't be found yet, such as a staging copy."
          icon={Radar}
          iconTone={report.allowIndexing ? "success" : "danger"}
          action={
            <InfoChip tone={report.allowIndexing ? "success" : "danger"} className="shrink-0">
              {report.allowIndexing ? "Visible" : "Hidden"}
            </InfoChip>
          }
        />
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          <VisibilitySwitch
            siteId={site.id}
            allowIndexing={report.allowIndexing}
            canManage={canManage}
          />
        </CardContent>
      </VisualCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <VisualCard aria-labelledby="pages-heading">
          <CardHeader
            id="pages-heading"
            title="Page-level settings"
            icon={FileCog}
            iconTone="neutral"
          />
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="text-muted-foreground text-sm">
              Each page can be set to noindex or nofollow, left out of the sitemap, or given a
              canonical URL under Advanced in the editor.{" "}
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
          </CardContent>
        </VisualCard>

        <VisualCard aria-labelledby="robots-heading">
          <CardHeader id="robots-heading" title="robots.txt" icon={Bot} iconTone="neutral" />
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            <p className="text-muted-foreground text-sm">
              Your website serves its own <code className="font-mono">robots.txt</code>. A typical
              one allows crawling and points to your sitemap:
            </p>
            <pre className="visual-nested mt-3 overflow-x-auto px-3 py-2.5 font-mono text-xs">
              {`User-agent: *\nAllow: /\n\nSitemap: ${report.domain ? `https://${report.domain}` : "https://your-site.example"}/sitemap.xml`}
            </pre>
            <p className="text-muted-foreground mt-3 text-xs">
              Blocking a page in robots.txt stops crawling but doesn&apos;t remove it from search
              results; use noindex for that.
            </p>
          </CardContent>
        </VisualCard>
      </div>
    </div>
  );
}
