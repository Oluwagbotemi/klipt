import type { Metadata } from "next";
import { EntryEditor } from "@/components/editor/entry-editor";
import { isEmailEnabled } from "@/lib/data/email";
import { getAssignees } from "@/lib/data/assignments";
import { getEntryDocument } from "@/lib/data/content";
import { getSitePreviewUrl } from "@/lib/data/previews";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { getEntryTaxonomies } from "@/lib/data/taxonomy";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/content/[entryId]">): Promise<Metadata> {
  const { siteId, entryId } = await params;
  const { entry } = await getEntryDocument(siteId, entryId);
  return { title: entry.title || `Untitled ${entry.modelName.toLowerCase()}` };
}

export default async function EntryPage({
  params,
}: PageProps<"/sites/[siteId]/content/[entryId]">) {
  const { siteId, entryId } = await params;
  const [user, site, doc, previewUrl, taxonomies, { assignees, today }] = await Promise.all([
    requireUser(),
    getSite(siteId),
    getEntryDocument(siteId, entryId),
    getSitePreviewUrl(siteId),
    getEntryTaxonomies(siteId, entryId),
    getAssignees(siteId),
  ]);

  return (
    <EntryEditor
      key={doc.entry.id}
      siteId={site.id}
      siteName={site.name}
      domain={site.domain}
      role={site.currentUserRole}
      userId={user.id}
      doc={doc}
      previewHost={previewUrl ? new URL(previewUrl).host : null}
      taxonomies={taxonomies}
      assignees={assignees}
      today={today}
      emailEnabled={isEmailEnabled()}
    />
  );
}
