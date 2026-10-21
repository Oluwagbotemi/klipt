import type { Metadata } from "next";
import { MenuEditor } from "@/components/navigation/menu-editor";
import { getMenuDetail } from "@/lib/data/menus";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/navigation/[menuKey]">): Promise<Metadata> {
  const { siteId, menuKey } = await params;
  const menu = await getMenuDetail(siteId, menuKey);
  return { title: `${menu.name} menu · Navigation` };
}

export default async function MenuPage({
  params,
}: PageProps<"/sites/[siteId]/navigation/[menuKey]">) {
  const { siteId, menuKey } = await params;
  const [site, menu] = await Promise.all([getSite(siteId), getMenuDetail(siteId, menuKey)]);
  return (
    <MenuEditor
      key={menu.id}
      siteId={site.id}
      siteDomain={site.domain}
      menu={menu}
      canManage={can(site.currentUserRole, "navigation.manage")}
    />
  );
}
