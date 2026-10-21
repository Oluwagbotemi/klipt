import { z } from "zod";
import { resolvePath } from "@/server/delivery";
import { ApiError, apiJson, handleDelivery, parseQuery } from "@/lib/data/delivery";

const query = z.object({ path: z.string().min(1).max(2048) });

/**
 * GET /api/v1/resolve?path=/posts/my-post: what lives at a URL on your site.
 * Returns the entry, a term archive page, a redirect to follow, or 404.
 */
export function GET(request: Request) {
  return handleDelivery(async ({ db, site }) => {
    const result = await resolvePath(db, site, parseQuery(query, request.url).path);
    if (!result) throw new ApiError(404, "not_found", "Nothing is published at that path.");
    if (result.kind === "redirect") {
      return apiJson({ redirect: { to: result.to, statusCode: result.statusCode } });
    }
    if (result.kind === "term") {
      return apiJson({ term: { taxonomy: result.taxonomy, ...result.term } });
    }
    return apiJson({ data: result.entry });
  });
}
