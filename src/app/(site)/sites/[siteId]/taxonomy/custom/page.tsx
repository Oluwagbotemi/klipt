import type { Metadata } from "next";
import { TaxonomyList } from "@/components/taxonomy/taxonomy-list";
import { getModels } from "@/lib/data/models";
import { getSite } from "@/lib/data/sites";
import { getTaxonomies } from "@/lib/data/taxonomy";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Custom taxonomies · Taxonomy" };

export default async function CustomTaxonomiesPage({
  params,
}: PageProps<"/sites/[siteId]/taxonomy/custom">) {
  const { siteId } = await params;
  const [site, taxonomies, models] = await Promise.all([
    getSite(siteId),
    getTaxonomies(siteId),
    getModels(siteId),
  ]);
  return (
    <TaxonomyList
      siteId={site.id}
      taxonomies={taxonomies.filter((taxonomy) => !taxonomy.isSystem)}
      models={models.map(({ key, name }) => ({ key, name }))}
      canManage={can(site.currentUserRole, "models.manage")}
    />
  );
}
