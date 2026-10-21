import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, ExternalLink, Info } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PermissionDenied } from "@/components/permission-denied";
import { PerformanceFilters, perfCard, RatingBadge } from "@/components/performance/parts";
import { Badge } from "@/components/ui/badge";
import { getRecommendations } from "@/lib/data/performance";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { parsePerformanceParams } from "@/lib/performance";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Recommendations · Performance" };

/** What to fix first, from the site's own measurements and media library. */
export default async function RecommendationsPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/performance/recommendations">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "performance.view")) {
    return (
      <PermissionDenied
        area="Performance"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const { device, days } = parsePerformanceParams(query);
  const { report, recommendations } = await getRecommendations(site.id, device, days);
  const connected = report.lastReceivedOn !== null;
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;
  const media = siteHref(site.id, "media");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-8">
      {connected ? (
        <PerformanceFilters
          base={siteHref(site.id, "performance", "recommendations")}
          device={device}
          days={days}
        />
      ) : (
        <div
          role="status"
          className="bg-muted/50 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm"
        >
          <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            Your website isn&apos;t sending measurements yet, so these suggestions only cover the
            media library.
          </p>
          <Link
            href={siteHref(site.id, "performance")}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Connect your website
          </Link>
        </div>
      )}

      {recommendations.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing to fix right now"
          description={
            connected
              ? "Your measured pages meet the Core Web Vitals targets and your images look fine."
              : "Your images look fine. Connect your website for suggestions based on real visits."
          }
        />
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Recommendations">
          {recommendations.map((rec) => (
            <li key={rec.key} className={`${perfCard} flex flex-col gap-3 p-5 sm:p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 flex-1 basis-60 text-base font-semibold">{rec.title}</h2>
                {rec.severity === "info" ? (
                  <Badge variant="secondary">From your media library</Badge>
                ) : (
                  <RatingBadge rating={rec.severity} />
                )}
              </div>
              <p className="text-sm">
                <span className="font-medium">Why: </span>
                {rec.why}
              </p>
              <p className="text-sm">
                <span className="font-medium">What to do: </span>
                {rec.fix}
              </p>
              {rec.pages.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Pages</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {rec.pages.map((page) => (
                      <li key={page.path} className="flex min-w-0 items-baseline gap-2">
                        {page.entryId ? (
                          <Link
                            href={entryHref(page.entryId)}
                            className="text-primary min-w-0 truncate underline-offset-4 hover:underline"
                          >
                            {page.title ?? page.path}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate font-mono text-xs">{page.path}</span>
                        )}
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {page.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rec.assets.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Images</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {rec.assets.map((asset) => (
                      <li key={asset.id} className="flex min-w-0 items-baseline gap-2">
                        <Link
                          href={`${media}?file=${asset.id}`}
                          className="text-primary min-w-0 truncate underline-offset-4 hover:underline"
                        >
                          {asset.filename}
                        </Link>
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {asset.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a
                href={rec.learnMore}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
              >
                How to fix this
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ol>
      )}
      <p className="text-muted-foreground text-xs">
        Suggestions come from fixed rules applied to your measurements and media library. They point
        to likely causes; your developer can confirm them with Lighthouse or PageSpeed Insights.
      </p>
    </div>
  );
}
