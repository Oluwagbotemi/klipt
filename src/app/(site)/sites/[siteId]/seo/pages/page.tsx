import type { Metadata } from "next";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SiteHiddenNotice, TruncatedNote, seoCard } from "@/components/seo/seo-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-8">
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
          className="pl-9"
          autoComplete="off"
        />
      </form>
      <nav aria-label="Filter by recommendation" className="flex flex-wrap gap-2">
        <Link
          href={href({ issue: null })}
          aria-current={!issue ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            !issue ? "bg-foreground text-background border-transparent" : "hover:bg-accent",
          )}
        >
          All live pages <span className="opacity-70">{report.pages.length}</span>
        </Link>
        {PAGE_ISSUE_KEYS.filter((key) => report.issueCounts[key] > 0).map((key) => (
          <Link
            key={key}
            href={href({ issue: key })}
            aria-current={issue === key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              issue === key
                ? "bg-foreground text-background border-transparent"
                : "hover:bg-accent",
            )}
          >
            {PAGE_ISSUES[key].title} <span className="opacity-70">{report.issueCounts[key]}</span>
          </Link>
        ))}
      </nav>
      {issue && <p className="text-muted-foreground text-sm">{PAGE_ISSUES[issue].why}</p>}

      {pages.length === 0 ? (
        report.pages.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No live pages yet"
            description="Pages appear here once they're published, with recommendations for each."
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No matching pages"
            action={
              <Button variant="outline" asChild>
                <Link href={base}>Clear filters</Link>
              </Button>
            }
          />
        )
      ) : (
        <ul className={cn(seoCard, "divide-y")} aria-label="Live pages">
          {pages.map((page) => {
            const titleLong = page.seoTitle.length > SEO_GUIDANCE.title.max;
            return (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 grid grid-cols-1 gap-2 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{page.title}</span>
                    <span className="text-muted-foreground block truncate font-mono text-xs">
                      {page.path}
                    </span>
                  </span>
                  <span className="min-w-0 text-xs">
                    <span className={cn("block truncate", titleLong && "text-warning")}>
                      {page.seoTitle}{" "}
                      <span className="text-muted-foreground">({page.seoTitle.length})</span>
                    </span>
                    <span
                      className={cn(
                        "block truncate",
                        page.description ? "text-muted-foreground" : "text-warning",
                      )}
                    >
                      {page.description || "No description"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 md:justify-end">
                    {page.index ? (
                      <Badge variant="success">Indexable</Badge>
                    ) : (
                      <Badge variant="outline">Noindex</Badge>
                    )}
                    {page.issues.length > 0 ? (
                      <Badge variant="warning">
                        {page.issues.length}{" "}
                        {page.issues.length === 1 ? "suggestion" : "suggestions"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No suggestions</Badge>
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
