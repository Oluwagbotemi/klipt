import type { Metadata } from "next";
import { ContentListPage } from "@/components/content/content-list-page";

export const metadata: Metadata = { title: "Pages" };

export default function Page({ params, searchParams }: PageProps<"/sites/[siteId]/content/pages">) {
  return <ContentListPage params={params} searchParams={searchParams} type="page" />;
}
