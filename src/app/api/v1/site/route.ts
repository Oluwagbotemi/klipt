import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/site: the site this API key belongs to. */
export function GET() {
  return handleDelivery(async ({ site }) => {
    const { id, name, domain, url, language, timezone, allowIndexing, titleTemplate } = site;
    return apiJson({
      data: { id, name, domain, url, language, timezone, allowIndexing, titleTemplate },
    });
  });
}
