import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";
import { getSiteNavItem, getSiteTab } from "@/lib/navigation";

// No generateStaticParams: tabs vary per section, and the section-level
// loading.tsx provides the Suspense boundary for request-time params.

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/[section]/[tab]">): Promise<Metadata> {
  const { section, tab } = await params;
  const item = getSiteNavItem(section);
  const label = item && getSiteTab(item, tab)?.label;
  return { title: item && label ? `${label} · ${item.label}` : undefined };
}

export default async function PlannedTabPage({
  params,
}: PageProps<"/sites/[siteId]/[section]/[tab]">) {
  const { siteId, section, tab } = await params;
  return <PlannedPage siteId={siteId} section={section} segment={tab} />;
}
