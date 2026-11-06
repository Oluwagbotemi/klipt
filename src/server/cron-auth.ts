import { timingSafeEqual } from "node:crypto";

/**
 * Checks `Authorization: Bearer $CRON_SECRET` in constant time. Vercel's cron
 * sends it, and external schedulers are set up to send the same header.
 */
export function isCronAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
