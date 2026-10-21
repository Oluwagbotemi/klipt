import { z } from "zod";
import { listPublished, resolveTermFilters, type TermFilter } from "@/server/delivery";
import {
  ApiError,
  apiJson,
  contentTypeParam,
  handleDelivery,
  parseQuery,
} from "@/lib/data/delivery";

const slugParam = z.string().regex(/^[a-z0-9-]{1,80}$/, "Use a term slug such as news.");

const query = z.object({
  type: contentTypeParam.optional(),
  category: slugParam.optional(),
  tag: slugParam.optional(),
  term: z
    .string()
    .regex(/^[a-z0-9-]{1,40}:[a-z0-9-]{1,80}$/, "Use taxonomy:slug, e.g. region:europe.")
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/v1/entries?type=post&page=1&limit=20: published entries, newest first.
 * Filter by term with ?category=news, ?tag=seo or ?term=region:europe (all must match).
 */
export function GET(request: Request) {
  return handleDelivery(async ({ db, site }) => {
    const { category, tag, term, ...options } = parseQuery(query, request.url);
    const filters: TermFilter[] = [];
    if (category) filters.push({ taxonomy: "category", slug: category });
    if (tag) filters.push({ taxonomy: "tag", slug: tag });
    if (term) {
      const [taxonomy, slug] = term.split(":");
      filters.push({ taxonomy, slug });
    }
    const resolved = await resolveTermFilters(db, site.id, filters);
    if (!resolved.ok) {
      const { taxonomy, slug } = resolved.filter;
      throw new ApiError(404, "not_found", `No term “${slug}” in the “${taxonomy}” taxonomy.`);
    }
    const { items, ...pagination } = await listPublished(db, site, {
      ...options,
      termSets: resolved.termSets,
    });
    return apiJson({ data: items, pagination });
  });
}
