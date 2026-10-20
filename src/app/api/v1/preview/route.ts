import { z } from "zod";
import { getPreviewEntry } from "@/server/delivery";
import { ApiError, apiJson, handleDelivery, parseQuery } from "@/lib/data/delivery";

const query = z.object({ token: z.string().min(1).max(1000) });

const FAILURES = {
  invalid: [
    401,
    "invalid_preview_token",
    "This preview link isn't valid. Open Preview in Klipt again.",
  ],
  expired: [401, "preview_expired", "This preview link has expired. Open Preview in Klipt again."],
  wrong_site: [
    403,
    "wrong_site",
    "This preview link belongs to a different site than this API key.",
  ],
  not_found: [404, "not_found", "The entry no longer exists or was archived."],
} as const;

/**
 * GET /api/v1/preview?token=…: an entry's current content (drafts included)
 * for a preview link from Klipt's editor. Needs the API key and the token.
 */
export function GET(request: Request) {
  return handleDelivery(async ({ db, site }) => {
    const result = await getPreviewEntry(db, site, parseQuery(query, request.url).token);
    if (!result.ok) {
      const [status, code, message] = FAILURES[result.reason];
      throw new ApiError(status, code, message);
    }
    return apiJson({ data: result.entry });
  });
}
