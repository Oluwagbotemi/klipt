import { getDeliveryMenu } from "@/server/menus";
import { menuKeySchema } from "@/lib/menus";
import { ApiError, apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/menus/header: one menu's links, nested, published targets only. */
export function GET(_request: Request, context: RouteContext<"/api/v1/menus/[key]">) {
  return handleDelivery(async ({ db, site }) => {
    const { key } = await context.params;
    const valid = menuKeySchema.safeParse(key);
    const menu = valid.success ? await getDeliveryMenu(db, site.id, valid.data) : null;
    if (!menu) throw new ApiError(404, "not_found", "No menu with that key.");
    return apiJson({ data: menu });
  });
}
