import { MediaLibrary } from "@/components/media/media-library";
import { getMediaAsset, getMediaList } from "@/lib/data/media";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { parseMediaListParams, type MediaKind } from "@/lib/media";

/** Loads one media view (a tab) from URL parameters, plus the open file if any. */
export async function MediaLibraryPage({
  params,
  searchParams,
  kind,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  kind: MediaKind;
}) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const listParams = parseMediaListParams(query);
  const fileId = typeof query.file === "string" && query.file.length <= 64 ? query.file : null;
  const [user, site, list, selected] = await Promise.all([
    requireUser(),
    getSite(siteId),
    getMediaList(siteId, kind, listParams),
    fileId ? getMediaAsset(siteId, fileId).catch(() => null) : null,
  ]);

  return (
    <MediaLibrary
      siteId={site.id}
      kind={kind}
      role={site.currentUserRole}
      userId={user.id}
      list={list}
      params={listParams}
      selected={selected}
    />
  );
}
