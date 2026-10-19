import type { Metadata } from "next";
import { MediaLibraryPage } from "@/components/media/media-library-page";

export const metadata: Metadata = { title: "Files · Media" };

export default function Page({ params, searchParams }: PageProps<"/sites/[siteId]/media/files">) {
  return <MediaLibraryPage params={params} searchParams={searchParams} kind="files" />;
}
