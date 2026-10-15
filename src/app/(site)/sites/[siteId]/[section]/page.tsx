import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";
import { getSiteNavItem, SITE_NAV_ITEMS } from "@/lib/navigation";

/*
 * Placeholder for site sections that haven't been built yet. Each section gets
 * its own static route as it is implemented (static segments take precedence
 * over this dynamic one); give it a layout that renders <SectionLayout>.
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
  return <PlannedPage siteId={siteId} section={section} segment={null} />;
}
