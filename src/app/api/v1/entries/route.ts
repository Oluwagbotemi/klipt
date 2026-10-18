import { z } from "zod";
import { listPublished } from "@/server/delivery";
import { apiJson, contentTypeParam, handleDelivery, parseQuery } from "@/lib/data/delivery";

const query = z.object({
  type: contentTypeParam.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/v1/entries?type=post&page=1&limit=20: published entries, newest first. */
export function GET(request: Request) {
  return handleDelivery(async ({ db, site }) => {
    const { items, ...pagination } = await listPublished(db, site, parseQuery(query, request.url));
    return apiJson({ data: items, pagination });
  });
}
