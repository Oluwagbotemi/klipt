import { EyeOff, ShieldCheck } from "lucide-react";
import { CardHeader, VisualCard } from "@/components/visual/card";
import { Donut } from "@/components/visual/donut";
import { InfoChip } from "@/components/visual/info-chip";
import { Celebrate, Illustration } from "@/components/visual/illustration";

/**
 * Live pages with and without SEO suggestions. Suggestions are guidance from
 * Klipt's own checks, not a search-engine score.
 */
export function SeoHealthCard({
  live,
  healthy,
  allowIndexing,
  href,
}: {
  live: number;
  healthy: number;
  allowIndexing: boolean;
  href: string;
}) {
  const percent = live ? Math.round((healthy / live) * 100) : 0;
  const allGood = live > 0 && healthy === live;
  return (
    <VisualCard aria-labelledby="seo-health-heading" className="lg:col-span-4">
      <CardHeader
        id="seo-health-heading"
        title="SEO health"
        description="Live pages without suggestions"
        icon={ShieldCheck}
        iconTone="success"
        href={href}
        hrefLabel="Open SEO"
      />
      <div className="relative flex flex-1 flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        {!allowIndexing && (
          <InfoChip tone="danger" icon={EyeOff} className="self-start">
            Hidden from search engines
          </InfoChip>
        )}
        {live === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Illustration scene="content" />
            <p className="text-muted-foreground max-w-56 text-sm">
              Nothing live yet. Checks start once you publish.
            </p>
          </div>
        ) : (
          <>
            {allGood && <Celebrate />}
            <Donut
              title="Live pages by SEO status"
              centerValue={
                <>
                  {percent}
                  <span className="text-base opacity-60">%</span>
                </>
              }
              centerLabel="look good"
              segments={[
                {
                  key: "healthy",
                  label: "No suggestions",
                  value: healthy,
                  stroke: "stroke-chart-good",
                  swatch: "bg-chart-good",
                },
                {
                  key: "suggestions",
                  label: "Have suggestions",
                  value: live - healthy,
                  stroke: "stroke-chart-attention",
                  swatch: "bg-chart-attention",
                },
              ]}
            />
            <p className="text-muted-foreground text-xs">
              {allGood
                ? "Every live page passes Klipt's checks."
                : "Suggestions never block publishing and don't guarantee rankings."}
            </p>
          </>
        )}
      </div>
    </VisualCard>
  );
}
