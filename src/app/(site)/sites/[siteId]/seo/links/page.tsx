import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off, Unlink } from "lucide-react";
import { TruncatedNote } from "@/components/seo/seo-parts";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, VisualCard } from "@/components/visual/card";
import { Illustration } from "@/components/visual/illustration";
import { InfoChip } from "@/components/visual/info-chip";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Internal links · SEO" };

function CountChip({ count, bad }: { count: number; bad: boolean }) {
  return (
    <InfoChip tone={count === 0 ? "success" : bad ? "danger" : "warning"} className="shrink-0">
      {count}
    </InfoChip>
  );
}

function AllClear({ message }: { message: string }) {
  return (
    <CardContent center className="px-5 pb-8 sm:px-6">
      <Illustration scene="success" className="h-20" />
      <p className="text-muted-foreground max-w-64 text-sm">{message}</p>
    </CardContent>
  );
}

export default async function SeoLinksPage({ params }: PageProps<"/sites/[siteId]/seo/links">) {
  const { siteId } = await params;
  const [site, report] = await Promise.all([getSite(siteId), getSeoReport(siteId)]);
  const canRedirect = can(site.currentUserRole, "seo.manage");
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;
  const redirectHref = (from: string) =>
    `${siteHref(site.id, "seo", "redirects")}?new=${encodeURIComponent(from)}`;
  const nothingLive = report.pages.length === 0;

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <VisualCard aria-labelledby="broken-heading">
          <CardHeader
            id="broken-heading"
            title="Broken links"
            description="Links in live pages to addresses on your site where nothing is published and no redirect exists. Fix the link in the page, or redirect the address."
            icon={Unlink}
            iconTone={report.broken.length > 0 ? "danger" : "success"}
            action={<CountChip count={report.broken.length} bad />}
          />
          {report.broken.length === 0 ? (
            <AllClear
              message={nothingLive ? "Nothing to check yet." : "No broken internal links found."}
            />
          ) : (
            <CardContent>
              <ul
                className="divide-card-border border-card-border divide-y border-t"
                aria-label="Broken links"
              >
                {report.broken.map((item) => (
                  <li
                    key={`${item.id}-${item.href}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-danger-strong truncate font-mono text-sm">{item.href}</p>
                      <p className="text-muted-foreground truncate text-xs">On {item.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="soft" size="sm" asChild>
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
            </CardContent>
          )}
        </VisualCard>

        <VisualCard aria-labelledby="orphans-heading">
          <CardHeader
            id="orphans-heading"
            title="Pages nothing links to"
            description="No other live page links here, so readers and crawlers may not find them. Your home page, and pages linked from your website's menus, are usually fine."
            icon={Link2Off}
            iconTone={report.orphans.length > 0 ? "warning" : "success"}
            action={<CountChip count={report.orphans.length} bad={false} />}
          />
          {report.orphans.length === 0 ? (
            <AllClear
              message={
                nothingLive ? "Nothing to check yet." : "Every live page is linked from another."
              }
            />
          ) : (
            <CardContent>
              <ul
                className="divide-card-border border-card-border divide-y border-t"
                aria-label="Pages nothing links to"
              >
                {report.orphans.map((page) => (
                  <li key={page.id}>
                    <Link
                      href={entryHref(page.id)}
                      className="hover:bg-accent/50 focus-visible:ring-ring/50 block px-5 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                    >
                      <span className="block truncate text-sm font-medium">{page.title}</span>
                      <span className="text-muted-foreground block truncate font-mono text-xs">
                        {page.path}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </VisualCard>
      </div>
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
