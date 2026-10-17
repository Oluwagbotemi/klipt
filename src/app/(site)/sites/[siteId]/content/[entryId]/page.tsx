import type { Metadata } from "next";
import { EntryEditor } from "@/components/editor/entry-editor";
import { getEntryDocument } from "@/lib/data/content";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

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
  const [user, site, doc] = await Promise.all([
    requireUser(),
    getSite(siteId),
    getEntryDocument(siteId, entryId),
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
    />
  );
}
