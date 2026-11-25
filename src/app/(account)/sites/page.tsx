import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOnboarding } from "@/lib/data/onboarding";
import { SitesView } from "./sites-view";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage({ searchParams }: PageProps<"/sites">) {
  const [query, onboarding] = await Promise.all([searchParams, getOnboarding()]);
  // New people with no sites start with the welcome flow.
  if (onboarding.needed) redirect("/welcome");
  const notice =
    query.archived === "1"
      ? "Site archived. You can restore it below."
      : query.deleted === "1"
        ? "Site deleted."
        : null;

  return <SitesView notice={notice} />;
}
