import type { Metadata } from "next";
import Link from "next/link";
import { HardDrive, ImageIcon, TriangleAlert } from "lucide-react";
import { EmptyCard } from "@/components/insights/parts";
import { PermissionDenied } from "@/components/permission-denied";
import { perfCard } from "@/components/performance/parts";
import { InfoChip } from "@/components/visual/info-chip";
import { ProgressBar } from "@/components/visual/progress-bar";
import { StatCard } from "@/components/visual/stat-card";
import { formatDate } from "@/lib/format";
import { getAssetReport } from "@/lib/data/performance";
import { getSite } from "@/lib/data/sites";
import { formatBytes } from "@/lib/media";
import { siteHref } from "@/lib/navigation";
import { LARGE_IMAGE_BYTES, LARGE_IMAGE_WIDTH, type AssetIssue } from "@/lib/performance";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Assets · Performance" };

const ISSUE_TEXT: Record<AssetIssue, { label: string; tone: "warning" | "neutral" }> = {
  large_file: { label: `Over ${LARGE_IMAGE_BYTES / 1024} KB`, tone: "warning" },
  too_wide: { label: `Wider than ${LARGE_IMAGE_WIDTH}px`, tone: "warning" },
  no_dimensions: { label: "Size unknown", tone: "neutral" },
  no_alt: { label: "No alt text", tone: "neutral" },
};

/** Images in the media library that can slow pages down or shift the layout. */
export default async function PerformanceAssetsPage({
  params,
}: PageProps<"/sites/[siteId]/performance/assets">) {
  const { siteId } = await params;
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
  const report = await getAssetReport(site.id);
  const media = siteHref(site.id, "media");
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <p className="text-muted-foreground max-w-prose text-sm">
        Checked from your media library, no website connection needed. Large images are the most
        common reason pages load slowly, and images without a known size make the page jump while
        they load. {report.imageCount} {report.imageCount === 1 ? "image" : "images"},{" "}
        {formatBytes(report.totalBytes)} in total.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Images"
          value={report.imageCount}
          icon={ImageIcon}
          caption="In the media library"
        />
        <StatCard
          label="To improve"
          value={report.findings.length}
          icon={TriangleAlert}
          iconTone={report.findings.length > 0 ? "warning" : "success"}
          caption={report.findings.length > 0 ? "Listed below" : "Nothing to fix"}
          chart={
            report.imageCount > 0 ? (
              <ProgressBar
                value={report.findings.length}
                max={report.imageCount}
                label="Images with something to improve"
                tone="warning"
              />
            ) : null
          }
        />
        <StatCard
          label="Total size"
          value={report.totalBytes / (1024 * 1024)}
          format={{ decimals: 1, unit: " MB", compact: false }}
          icon={HardDrive}
          caption={formatBytes(report.totalBytes)}
          className="col-span-2 lg:col-span-1"
        />
      </div>
      {report.findings.length === 0 ? (
        <EmptyCard
          scene={report.imageCount === 0 ? "media" : "success"}
          title={report.imageCount === 0 ? "No images yet" : "All images look good"}
          description={
            report.imageCount === 0
              ? "Images you upload to the media library are checked here."
              : `Every image is under ${LARGE_IMAGE_BYTES / 1024} KB, has a known size and alt text.`
          }
        />
      ) : (
        <ul
          className={`${perfCard} divide-card-border divide-y overflow-hidden`}
          aria-label="Images to improve"
        >
          {report.findings.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small preview of the stored file */}
              <img
                src={asset.url}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                className="bg-muted border-card-border size-14 shrink-0 rounded-xl border object-cover"
              />
              <div className="min-w-0 flex-1 basis-56">
                <Link
                  href={`${media}?file=${asset.id}`}
                  className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {asset.filename}
                </Link>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatBytes(asset.sizeBytes)}
                  {asset.width && asset.height
                    ? ` · ${asset.width} × ${asset.height}px`
                    : " · size unknown"}{" "}
                  · uploaded {formatDate(asset.createdAt)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {asset.issues.map((issue) => (
                    <InfoChip key={issue} tone={ISSUE_TEXT[issue].tone}>
                      {ISSUE_TEXT[issue].label}
                    </InfoChip>
                  ))}
                </div>
              </div>
              <div className="min-w-0 basis-full text-xs sm:basis-56">
                {asset.usage.length === 0 ? (
                  <p className="text-muted-foreground">Not used in any content</p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Used in {asset.usage.length} {asset.usage.length === 1 ? "entry" : "entries"}
                    </p>
                    <ul className="mt-0.5">
                      {asset.usage.slice(0, 3).map((use) => (
                        <li key={use.id} className="truncate">
                          <Link
                            href={entryHref(use.id)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {use.title || "Untitled"}
                          </Link>
                        </li>
                      ))}
                      {asset.usage.length > 3 && (
                        <li className="text-muted-foreground">and {asset.usage.length - 3} more</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        Klipt shrinks large photos in the browser before uploading, so oversized images are usually
        older uploads. To fix one, upload a smaller copy (about 1600px wide is enough for most
        layouts) and swap it into the content that uses it.
      </p>
    </div>
  );
}
