import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { AssignmentBoardView } from "@/components/team/assignment-board";
import { getAssignmentBoard } from "@/lib/data/assignments";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Assignments · Team" };

/** Who is working on what: open work per member, reviews waiting, overdue and unassigned drafts. */
export default async function AssignmentsPage({
  params,
}: PageProps<"/sites/[siteId]/team/assignments">) {
  const { siteId } = await params;
  const [user, site] = await Promise.all([requireUser(), getSite(siteId)]);
  if (!can(site.currentUserRole, "content.create")) {
    return (
      <PermissionDenied
        area="Assignments"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const board = await getAssignmentBoard(site.id);
  return (
    <AssignmentBoardView
      siteId={site.id}
      board={board}
      me={{ userId: user.id, role: site.currentUserRole }}
    />
  );
}
