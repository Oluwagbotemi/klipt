import type { Metadata } from "next";
import { ModelList } from "@/components/models/model-list";
import { getModels } from "@/lib/data/models";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Content models" };

export default async function ModelsPage({ params }: PageProps<"/sites/[siteId]/models">) {
  const { siteId } = await params;
  const [site, models] = await Promise.all([getSite(siteId), getModels(siteId)]);
  return (
    <ModelList
      siteId={site.id}
      models={models}
      canManage={can(site.currentUserRole, "models.manage")}
    />
  );
}
