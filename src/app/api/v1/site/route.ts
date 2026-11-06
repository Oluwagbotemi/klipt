import { getDeliveryBranding } from "@/server/delivery";
import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/site: the site this API key belongs to, with its logo and favicon. */
export function GET() {
  return handleDelivery(async ({ db, site }) => {
    const { id, name, domain, url, language, timezone, allowIndexing, titleTemplate } = site;
    const { logo, favicon } = await getDeliveryBranding(db, site);
    return apiJson({
      data: {
        id,
        name,
        domain,
        url,
        language,
        timezone,
        allowIndexing,
        titleTemplate,
        logo,
        favicon,
      },
    });
  });
}
