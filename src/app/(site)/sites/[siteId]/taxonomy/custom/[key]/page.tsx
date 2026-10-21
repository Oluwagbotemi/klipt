import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TermsPage } from "@/components/taxonomy/terms-page";

export const metadata: Metadata = { title: "Custom taxonomy · Taxonomy" };

export default async function CustomTermsPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/taxonomy/custom/[key]">) {
  const [{ siteId, key }, query] = await Promise.all([params, searchParams]);
  // Categories and Tags have their own tabs.
  if (key === "category" || key === "tag" || !/^[a-z][a-z0-9-]{1,39}$/.test(key)) notFound();
  const q = typeof query.q === "string" ? query.q.slice(0, 80) : "";
  return <TermsPage siteId={siteId} taxonomyKey={key} query={q} />;
}
