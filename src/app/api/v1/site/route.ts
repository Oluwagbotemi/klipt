import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/site: the site this API key belongs to. */
export function GET() {
  return handleDelivery(async ({ site }) => apiJson({ data: site }));
}
