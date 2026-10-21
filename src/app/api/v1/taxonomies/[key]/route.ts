import { listTaxonomyTerms } from "@/server/delivery";
import { ApiError, apiJson, contentTypeParam, handleDelivery } from "@/lib/data/delivery";

/**
 * GET /api/v1/taxonomies/category: a taxonomy's terms with published-entry
 * counts, nested under `children` for hierarchical taxonomies.
 */
export function GET(_request: Request, context: RouteContext<"/api/v1/taxonomies/[key]">) {
  return handleDelivery(async ({ db, site }) => {
    const { key } = await context.params;
    const valid = contentTypeParam.safeParse(key);
    const result = valid.success ? await listTaxonomyTerms(db, site, valid.data) : null;
    if (!result) throw new ApiError(404, "not_found", "No taxonomy with that key.");
    return apiJson({ data: result.terms, taxonomy: result.taxonomy });
  });
}
