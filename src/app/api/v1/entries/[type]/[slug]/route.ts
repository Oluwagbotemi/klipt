import { getPublishedEntry } from "@/server/delivery";
import { slugSchema } from "@/lib/seo";
import { ApiError, apiJson, contentTypeParam, handleDelivery } from "@/lib/data/delivery";

/** GET /api/v1/entries/post/my-first-post: one published entry with its body and SEO. */
export function GET(_request: Request, context: RouteContext<"/api/v1/entries/[type]/[slug]">) {
  return handleDelivery(async ({ db, site }) => {
    const { type, slug } = await context.params;
    const validType = contentTypeParam.safeParse(type);
    const validSlug = slugSchema.safeParse(slug);
    const entry =
      validType.success && validSlug.success
        ? await getPublishedEntry(db, site, validType.data, validSlug.data)
        : null;
    if (!entry) throw new ApiError(404, "not_found", "No published entry at that type and slug.");
    return apiJson({ data: entry });
  });
}
