import { listRedirects } from "@/server/delivery";
import { apiJson, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/redirects: every redirect, for websites that load them at build time. */
export function GET() {
  return handleDelivery(async ({ db, site }) =>
    apiJson({ data: await listRedirects(db, site.id) }),
  );
}
