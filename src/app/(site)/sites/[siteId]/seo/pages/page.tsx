import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Search, SearchX, TriangleAlert } from "lucide-react";
import { EmptyCard } from "@/components/insights/parts";
import { FilterPills } from "@/components/visual/filter-pills";
import { SiteHiddenNotice, TruncatedNote } from "@/components/seo/seo-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoChip } from "@/components/visual/info-chip";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { SEO_GUIDANCE } from "@/lib/seo";
import { PAGE_ISSUE_KEYS, PAGE_ISSUES, type PageIssueKey } from "@/lib/seo-audit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pages · SEO" };

export default async function SeoPagesPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/seo/pages">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const [site, report] = await Promise.all([getSite(siteId), getSeoReport(siteId)]);
  const issue = PAGE_ISSUE_KEYS.find((key) => key === query.issue) as PageIssueKey | undefined;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const base = siteHref(site.id, "seo", "pages");
  const href = (changes: { issue?: string | null; q?: string }) => {
    const next = new URLSearchParams();
    const nextIssue = changes.issue === undefined ? issue : changes.issue;
    const nextQ = changes.q ?? q;
    if (nextIssue) next.set("issue", nextIssue);
    if (nextQ) next.set("q", nextQ);
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const needle = q.toLowerCase();
  const pages = report.pages.filter(
    (page) =>
      (!issue || page.issues.includes(issue)) &&
      (!needle ||
        page.title.toLowerCase().includes(needle) ||
        page.path.toLowerCase().includes(needle)),
  );
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      {!report.allowIndexing && (
        <SiteHiddenNotice siteId={site.id} canManage={can(site.currentUserRole, "seo.manage")} />
      )}
      <form action={base} className="relative w-full lg:max-w-xs" role="search">
        {issue && <input type="hidden" name="issue" value={issue} />}
        <label htmlFor="seo-search" className="sr-only">
          Search pages
        </label>
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="seo-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by title or URL, then press Enter"
          className="rounded-full pl-9"
          autoComplete="off"
        />
      </form>
      <FilterPills
        label="Filter by recommendation"
        current={issue ?? "all"}
        items={[
          {
            value: "all",
            label: "All live pages",
            count: report.pages.length,
            href: href({ issue: null }),
          },
          ...PAGE_ISSUE_KEYS.filter((key) => report.issueCounts[key] > 0).map((key) => ({
            value: key,
            label: PAGE_ISSUES[key].title,
            count: report.issueCounts[key],
            href: href({ issue: key }),
            dot: "warning" as const,
          })),
        ]}
      />
      {issue && <p className="text-muted-foreground text-sm">{PAGE_ISSUES[issue].why}</p>}

      {pages.length === 0 ? (
        report.pages.length === 0 ? (
          <EmptyCard
            scene="content"
            title="No live pages yet"
            description="Pages appear here once they're published, with recommendations for each."
          />
        ) : (
          <EmptyCard
            scene="content"
            title="No matching pages"
            action={
              <Button variant="soft" asChild>
                <Link href={base}>Clear filters</Link>
              </Button>
            }
          />
        )
      ) : (
        <ul
          className="visual-card divide-card-border divide-y overflow-hidden"
          aria-label="Live pages"
        >
          {pages.map((page) => {
            const titleLong = page.seoTitle.length > SEO_GUIDANCE.title.max;
            return (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/50 focus-visible:ring-ring/50 grid grid-cols-1 gap-2 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{page.title}</span>
                    <span className="text-muted-foreground block truncate font-mono text-xs">
                      {page.path}
                    </span>
                  </span>
                  <span className="min-w-0 text-xs">
                    <span className={cn("block truncate", titleLong && "text-warning-strong")}>
                      {page.seoTitle}{" "}
                      <span className="text-muted-foreground">({page.seoTitle.length})</span>
                    </span>
                    <span
                      className={cn(
                        "block truncate",
                        page.description ? "text-muted-foreground" : "text-warning-strong",
                      )}
                    >
                      {page.description || "No description"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 md:justify-end">
                    {page.index ? (
                      <InfoChip tone="success" icon={Search}>
                        Indexable
                      </InfoChip>
                    ) : (
                      <InfoChip tone="neutral" icon={SearchX}>
                        Noindex
                      </InfoChip>
                    )}
                    {page.issues.length > 0 ? (
                      <InfoChip tone="warning" icon={TriangleAlert}>
                        {page.issues.length}{" "}
                        {page.issues.length === 1 ? "suggestion" : "suggestions"}
                      </InfoChip>
                    ) : (
                      <InfoChip tone="success" icon={CircleCheck}>
                        No suggestions
                      </InfoChip>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
