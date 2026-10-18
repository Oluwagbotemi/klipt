import { listSitemap } from "@/server/delivery";
import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/sitemap: URLs for your XML sitemap (indexable published entries only). */
export function GET() {
  return handleDelivery(async ({ db, site }) => apiJson({ data: await listSitemap(db, site) }));
}
