import type { Metadata } from "next";
import { ModelEditor } from "@/components/models/model-editor";
import { getModel, getModels } from "@/lib/data/models";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/models/[modelId]">): Promise<Metadata> {
  const { siteId, modelId } = await params;
  const model = await getModel(siteId, modelId);
  return { title: `${model.name} · Content models` };
}

export default async function ModelPage({ params }: PageProps<"/sites/[siteId]/models/[modelId]">) {
  const { siteId, modelId } = await params;
  const [site, model, models] = await Promise.all([
    getSite(siteId),
    getModel(siteId, modelId),
    getModels(siteId),
  ]);
  return (
    <ModelEditor
      key={model.id}
      siteId={site.id}
      model={model}
      allModels={models.map(({ key, name }) => ({ key, name }))}
      canManage={can(site.currentUserRole, "models.manage")}
    />
  );
}
