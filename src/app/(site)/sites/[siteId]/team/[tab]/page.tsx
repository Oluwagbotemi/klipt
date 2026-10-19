import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";
import { getSiteNavItem, getSiteTab } from "@/lib/navigation";

// Team tabs that aren't built yet. Built tabs get their own static route.

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/team/[tab]">): Promise<Metadata> {
  const { tab } = await params;
  const item = getSiteNavItem("team");
  const label = item && getSiteTab(item, tab)?.label;
  return { title: label ? `${label} · Team` : "Team" };
}

export default async function TeamTabPage({ params }: PageProps<"/sites/[siteId]/team/[tab]">) {
  const { siteId, tab } = await params;
  return <PlannedPage siteId={siteId} section="team" segment={tab} />;
}
