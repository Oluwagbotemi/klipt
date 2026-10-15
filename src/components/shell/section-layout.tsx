import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/shell/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSite } from "@/lib/data/sites";
import { getSiteNavItem } from "@/lib/navigation";

/**
 * Shared layout for a site section: header (breadcrumbs, title, tabs) above
 * the page. Use it from every section layout, e.g. a future
 * `sites/[siteId]/content/layout.tsx` passes section="content".
 */
export function SectionLayout({
  siteId,
  section,
  children,
}: {
  siteId: Promise<string>;
  section: Promise<string> | string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<SectionHeaderSkeleton />}>
        <SectionHeaderLoader siteId={siteId} section={section} />
      </Suspense>
      {children}
    </>
  );
}

async function SectionHeaderLoader({
  siteId,
  section,
}: {
  siteId: Promise<string>;
  section: Promise<string> | string;
}) {
  const [id, key] = await Promise.all([siteId, section]);
  const item = getSiteNavItem(key);
  if (!item) notFound();
  const site = await getSite(id);
  return (
    <SectionHeader
      siteId={site.id}
      siteName={site.name}
      section={item.section}
      role={site.currentUserRole}
    />
  );
}

function SectionHeaderSkeleton() {
  return (
    <div className="border-b px-4 pt-5 pb-5 sm:px-8 sm:pt-6" aria-hidden>
      <Skeleton className="mb-3 h-4 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    </div>
  );
}
