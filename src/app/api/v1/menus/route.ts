import { listDeliveryMenus } from "@/server/menus";
import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/menus: the site's menus (header, footer and custom), without their links. */
export function GET() {
  return handleDelivery(async ({ db, site }) =>
    apiJson({ data: await listDeliveryMenus(db, site.id) }),
  );
}
