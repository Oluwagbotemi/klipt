import "server-only";

import { getDb } from "@/server/db";
import { IngestError, ingestVitals } from "@/server/performance";
import { VITALS_LIMITS, vitalsPayloadSchema } from "@/lib/performance";

/*
 * POST /api/v1/vitals: measurements from the customer's website. The key in
 * the body is public (it ships in browser code), so the site's own origins are
 * the real check; the Origin header is set by the browser and can't be faked
 * by page scripts. Bodies are text/plain JSON so navigator.sendBeacon works
 * without a CORS preflight. Responses echo the caller's origin: they only
 * report how many measurements were stored, so any page may read them.
 */

const PER_MINUTE = 120;
const buckets = new Map<string, { tokens: number; at: number }>();

/** In-memory token bucket per key and client (per server instance; the daily cap is global). */
function takeToken(id: string, now = Date.now()) {
  if (buckets.size > 10_000) buckets.clear();
  const bucket = buckets.get(id) ?? { tokens: PER_MINUTE, at: now };
  bucket.tokens = Math.min(PER_MINUTE, bucket.tokens + ((now - bucket.at) / 60_000) * PER_MINUTE);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(id, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(id, bucket);
  return true;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(status: number, body: unknown, origin: string | null) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

const fail = (status: number, code: string, message: string, origin: string | null) =>
  reply(status, { error: { code, message } }, origin);

/** Preflight (only sent when the website posts application/json). The POST itself checks the origin. */
export function vitalsPreflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function handleVitalsIngest(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > VITALS_LIMITS.bodyBytes) {
    return fail(413, "too_large", "Send at most 16 KB per request.", origin);
  }
  const text = await request.text();
  if (text.length > VITALS_LIMITS.bodyBytes) {
    return fail(413, "too_large", "Send at most 16 KB per request.", origin);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json", "Send a JSON body.", origin);
  }
  const parsed = vitalsPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      400,
      "invalid_request",
      `${issue.path.join(".") || "body"}: ${issue.message}`,
      origin,
    );
  }

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!takeToken(`${parsed.data.key}:${client}`)) {
    return fail(
      429,
      "rate_limited",
      "Too many requests. Batch measurements and retry later.",
      origin,
    );
  }

  try {
    const db = await getDb();
    // The user agent only decides mobile vs desktop for events that don't say; it isn't stored.
    const ua = request.headers.get("user-agent") ?? "";
    const result = await ingestVitals(db, {
      key: parsed.data.key,
      origin,
      events: parsed.data.events,
      fallbackDevice: /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop",
    });
    return reply(200, { accepted: result.accepted }, origin);
  } catch (error) {
    if (error instanceof IngestError) return fail(error.status, error.code, error.message, origin);
    console.error("Vitals ingest failed", error);
    return fail(500, "server_error", "Something went wrong. Try again.", origin);
  }
}
