import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { ActivityFeedView } from "@/components/team/activity-feed";
import { parseActivityParams } from "@/lib/activity";
import { getActivity } from "@/lib/data/activity";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Activity · Team" };

/** Who changed what on the site, newest first. Editors see content work; admins see everything. */
export default async function ActivityPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/team/activity">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "activity.view")) {
    return (
      <PermissionDenied area="Activity" role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }
  const filters = parseActivityParams(query);
  const feed = await getActivity(site.id, filters);
  return (
    <ActivityFeedView
      feed={feed}
      filters={filters}
      limited={!can(site.currentUserRole, "activity.view_all")}
    />
  );
}
