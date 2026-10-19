import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { generateHTML } from "@tiptap/html/server";
import { Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS } from "@/lib/content";
import { getEntryDocument } from "@/lib/data/content";
import { withCurrentMedia } from "@/lib/data/media";
import { getSite } from "@/lib/data/sites";
import { richTextExtensions, sanitizeDoc } from "@/lib/editor/rich-text";
import { siteHref } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

/**
 * Draft preview with neutral styling. The live site is the customer's own
 * website (headless), so this is a faithful but plain view of the content.
 */
export default function PreviewPage({ params }: PageProps<"/preview/[siteId]/[entryId]">) {
  return (
    <Suspense fallback={<PreviewSkeleton />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: PageProps<"/preview/[siteId]/[entryId]">["params"] }) {
  const { siteId, entryId } = await params;
  const [site, doc] = await Promise.all([getSite(siteId), getEntryDocument(siteId, entryId)]);
  // Content is re-sanitized and rendered from the allow-listed schema only.
  const body = await withCurrentMedia(site.id, sanitizeDoc(doc.body));
  const html = generateHTML(body, richTextExtensions());
  const editHref = `${siteHref(site.id, "content")}/${doc.entry.id}`;

  return (
    <>
      <div
        role="note"
        className="bg-warning-soft text-warning sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-8"
      >
        <Eye className="size-4" aria-hidden />
        <span className="font-medium">Preview</span>
        <span>{STATUS_LABELS[doc.entry.status]} · not what visitors see on your live site</span>
        <Link href={editHref} className="ml-auto font-medium underline underline-offset-4">
          Back to editor
        </Link>
      </div>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
        <p className="text-muted-foreground font-mono text-xs">
          {site.domain ?? "your-site.example"}
          {doc.path}
        </p>
        <h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight">
          {doc.entry.title || "Untitled"}
        </h1>
        <article className="rich-text mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 sm:px-8" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
