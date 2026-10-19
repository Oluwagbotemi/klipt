import "server-only";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb, type Database } from "@/server/db";
import { authenticateApiKey } from "@/server/api-keys";
import { getDeliverySite, type DeliverySite } from "@/server/delivery";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";

/*
 * Request handling for the content delivery API (/api/v1). Every request
 * authenticates with a site API key; the key decides which site is read.
 * Responses are never cached by shared caches because they depend on the key.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization" };

export function apiJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...RESPONSE_HEADERS, ...extra } });
}

function errorResponse(error: ApiError) {
  return apiJson(
    { error: { code: error.code, message: error.message } },
    error.status,
    error.status === 401 ? { "WWW-Authenticate": 'Bearer realm="klipt"' } : {},
  );
}

/** Runs a delivery request for the site the API key belongs to. */
export async function handleDelivery(
  run: (context: { db: Database; site: DeliverySite }) => Promise<Response>,
): Promise<Response> {
  // Read the request first so nothing here runs during prerendering.
  const authorization = (await headers()).get("authorization") ?? "";
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
    if (!token) {
      throw new ApiError(401, "unauthorized", "Send your API key as: Authorization: Bearer <key>");
    }
    const db = await getDb();
    const key = await authenticateApiKey(db, token);
    if (!key) throw new ApiError(401, "unauthorized", "This API key is invalid or was revoked.");
    const site = await getDeliverySite(db, key.siteId);
    if (!site) throw new ApiError(401, "unauthorized", "This API key is invalid or was revoked.");
    // Reads publish due scheduled entries, which may have queued webhooks.
    scheduleWebhookDelivery(site.id);
    return await run({ db, site });
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    console.error("Content API request failed", error);
    return errorResponse(new ApiError(500, "server_error", "Something went wrong. Try again."));
  }
}

/** Parses query parameters, turning validation problems into a 400. */
export function parseQuery<T extends z.ZodType>(schema: T, url: string): z.output<T> {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".");
    throw new ApiError(
      400,
      "invalid_request",
      field ? `${field}: ${issue.message}` : issue.message,
    );
  }
  return parsed.data;
}

export const contentTypeParam = z
  .string()
  .regex(/^[a-z0-9_-]{1,40}$/, "Use a content type key such as post or page.");
