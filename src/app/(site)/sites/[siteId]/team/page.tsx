import type { Metadata } from "next";
import { TeamMembers } from "@/components/team/team-members";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { getTeam } from "@/lib/data/team";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/sites/[siteId]/team">) {
  const { siteId } = await params;
  const [user, site, team] = await Promise.all([requireUser(), getSite(siteId), getTeam(siteId)]);
  return (
    <TeamMembers
      siteId={site.id}
      siteName={site.name}
      team={team}
      me={{ userId: user.id, role: site.currentUserRole }}
    />
  );
}
