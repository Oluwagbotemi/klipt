import type { Metadata } from "next";
import { MenuList } from "@/components/navigation/menu-list";
import { getMenus } from "@/lib/data/menus";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Navigation" };

export default async function NavigationPage({ params }: PageProps<"/sites/[siteId]/navigation">) {
  const { siteId } = await params;
  const [site, menus] = await Promise.all([getSite(siteId), getMenus(siteId)]);
  return (
    <MenuList
      siteId={site.id}
      menus={menus}
      canManage={can(site.currentUserRole, "navigation.manage")}
    />
  );
}
