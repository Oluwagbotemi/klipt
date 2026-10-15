import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getSite } from "@/lib/data/sites";
import { getSiteNavItem, SITE_NAV_ITEMS } from "@/lib/navigation";

/*
 * Placeholder for site sections that haven't been built yet. Each section gets
 * its own static route as it is implemented (static segments take precedence
 * over this dynamic one), at which point its entry here becomes unreachable.
 */

export function generateStaticParams() {
  return SITE_NAV_ITEMS.map((item) => ({ section: item.section }));
}

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: getSiteNavItem(section)?.label };
}

export default async function PlannedSectionPage({
  params,
}: PageProps<"/sites/[siteId]/[section]">) {
  const { siteId, section } = await params;
  const item = getSiteNavItem(section);
  if (!item) notFound();
  // Pages authorize independently of the layout (they render in parallel).
  await getSite(siteId);

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <EmptyState
        icon={Construction}
        title={`${item.label} isn't built yet`}
        description="This section is part of the planned product. It will include:"
      >
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {item.planned.map((entry) => (
            <li key={entry} className="text-muted-foreground rounded-md border px-2.5 py-1 text-xs">
              {entry}
            </li>
          ))}
        </ul>
      </EmptyState>
    </>
  );
}
