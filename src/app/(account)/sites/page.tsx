import type { Metadata } from "next";
import { SitesView } from "./sites-view";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage({ searchParams }: PageProps<"/sites">) {
  const query = await searchParams;
  const notice =
    query.archived === "1"
      ? "Site archived. You can restore it below."
      : query.deleted === "1"
        ? "Site deleted."
        : null;

  return <SitesView notice={notice} />;
}
