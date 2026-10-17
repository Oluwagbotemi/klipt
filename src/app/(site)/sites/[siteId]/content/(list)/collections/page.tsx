import type { Metadata } from "next";
import { ContentListPage } from "@/components/content/content-list-page";

export const metadata: Metadata = { title: "Collections" };

export default function Page({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/content/collections">) {
  return <ContentListPage params={params} searchParams={searchParams} type="collection" />;
}
