import { ContentList } from "@/components/content/content-list";
import { parseContentListParams, type ContentType } from "@/lib/content";
import { getAssignees } from "@/lib/data/assignments";
import { getEntries } from "@/lib/data/content";
import { getCollectionTypes } from "@/lib/data/models";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/** Loads one content list view (a tab) from URL parameters and renders it. */
export async function ContentListPage({
  params,
  searchParams,
  type,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  type: ContentType;
}) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const listParams = parseContentListParams(query);
  const [user, site, list, collections, { today }] = await Promise.all([
    requireUser(),
    getSite(siteId),
    getEntries(siteId, type, listParams),
    getCollectionTypes(siteId),
    getAssignees(siteId),
  ]);

  return (
    <ContentList
      siteId={site.id}
      type={type}
      role={site.currentUserRole}
      userId={user.id}
      list={list}
      params={listParams}
      collections={collections}
      today={today}
    />
  );
}
