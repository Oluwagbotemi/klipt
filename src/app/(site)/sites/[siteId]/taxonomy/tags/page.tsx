import type { Metadata } from "next";
import { TermsPage } from "@/components/taxonomy/terms-page";

export const metadata: Metadata = { title: "Tags · Taxonomy" };

export default async function TagsPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/taxonomy/tags">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const q = typeof query.q === "string" ? query.q.slice(0, 80) : "";
  return <TermsPage siteId={siteId} taxonomyKey="tag" query={q} />;
}
