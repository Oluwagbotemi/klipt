import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/sites/[siteId]/settings">) {
  const { siteId } = await params;
  return <PlannedPage siteId={siteId} section="settings" segment={null} />;
}
