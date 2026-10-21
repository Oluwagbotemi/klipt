import "server-only";

import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as menusRepo from "@/server/menus";
import { requireUser } from "@/lib/data/session";

/** Data access for navigation menus (Navigation section). */

export async function getMenus(siteId: string) {
  const user = await requireUser();
  return menusRepo.listMenus(await getDb(), user.id, siteId);
}

/** One menu with its items; not-found if the site has no menu with that key. */
export async function getMenuDetail(siteId: string, key: string) {
  const user = await requireUser();
  const menu = await menusRepo.getMenu(await getDb(), user.id, siteId, key);
  if (!menu) notFound();
  return menu;
}
