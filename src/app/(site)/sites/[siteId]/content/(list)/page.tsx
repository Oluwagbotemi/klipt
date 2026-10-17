import type { Metadata } from "next";
import { ContentListPage } from "@/components/content/content-list-page";

export const metadata: Metadata = { title: "Content" };

export default function Page({ params, searchParams }: PageProps<"/sites/[siteId]/content">) {
  return <ContentListPage params={params} searchParams={searchParams} type="all" />;
}
