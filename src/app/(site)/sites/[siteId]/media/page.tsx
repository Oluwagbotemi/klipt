import type { Metadata } from "next";
import { MediaLibraryPage } from "@/components/media/media-library-page";

export const metadata: Metadata = { title: "Media" };

export default function Page({ params, searchParams }: PageProps<"/sites/[siteId]/media">) {
  return <MediaLibraryPage params={params} searchParams={searchParams} kind="all" />;
}
