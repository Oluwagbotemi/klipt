import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";
import { getSiteNavItem, getSiteTab } from "@/lib/navigation";

// Settings tabs that aren't built yet. Built tabs get their own static route.

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/settings/[tab]">): Promise<Metadata> {
  const { tab } = await params;
  const item = getSiteNavItem("settings");
  const label = item && getSiteTab(item, tab)?.label;
  return { title: label ? `${label} · Settings` : "Settings" };
}

export default async function SettingsTabPage({
  params,
}: PageProps<"/sites/[siteId]/settings/[tab]">) {
  const { siteId, tab } = await params;
  return <PlannedPage siteId={siteId} section="settings" segment={tab} />;
}
