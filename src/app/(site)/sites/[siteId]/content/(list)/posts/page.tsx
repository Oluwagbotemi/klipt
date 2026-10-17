import type { Metadata } from "next";
import { ContentListPage } from "@/components/content/content-list-page";

export const metadata: Metadata = { title: "Posts" };

export default function Page({ params, searchParams }: PageProps<"/sites/[siteId]/content/posts">) {
  return <ContentListPage params={params} searchParams={searchParams} type="post" />;
}
