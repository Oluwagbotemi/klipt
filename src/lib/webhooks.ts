import { z } from "zod";
import { siteHref } from "@/lib/navigation";

/** Events a webhook can subscribe to. "ping" is only sent by "Send test". */
export const WEBHOOK_EVENTS = [
  {
    key: "entry.published",
    label: "Published",
    description: "An entry goes live, including scheduled entries when their time comes.",
  },
  {
    key: "entry.updated",
    label: "Updated",
    description: "A live entry is edited. Sent at most every 30 seconds per entry.",
  },
  {
    key: "entry.unpublished",
    label: "Unpublished",
    description: "A live entry is unpublished or archived and should disappear from your site.",
  },
  {
    key: "entry.slug_changed",
    label: "URL changed",
    description: "A live entry moves to a new URL. Includes the previous path.",
  },
  {
    key: "menu.updated",
    label: "Menu changed",
    description: "A navigation menu is saved. Includes the menu key. Not on by default.",
  },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"] | "ping";

export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((event) => event.key);

/** Events checked when adding a webhook; menu changes are opt-in. */
export const DEFAULT_WEBHOOK_EVENTS: string[] = WEBHOOK_EVENT_KEYS.filter(
  (key) => key !== "menu.updated",
);

export const MAX_WEBHOOKS = 10;

/** Retries: delays after each failed attempt; the last failure is final. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export const webhookInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter the address on your website that should receive events.")
    .max(2000, "Keep the address under 2,000 characters."),
  description: z.string().trim().max(120, "Keep the description to 120 characters.").optional(),
  events: z
    .array(z.enum(WEBHOOK_EVENT_KEYS as [string, ...string[]]))
    .min(1, "Choose at least one event."),
});
export type WebhookInput = z.output<typeof webhookInputSchema>;

export type DeliveryStatus = "pending" | "succeeded" | "failed";

export interface WebhookSummary {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastDelivery: { status: DeliveryStatus; attempts: number; event: string; at: string } | null;
}

export interface WebhookDeliverySummary {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  /** When the next retry is due (pending only). */
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Integrations page, or one webhook's page. */
export function webhookHref(siteId: string, webhookId?: string) {
  const base = siteHref(siteId, "settings", "integrations");
  return webhookId ? `${base}/webhooks/${webhookId}` : base;
}

export function eventLabel(event: string) {
  if (event === "ping") return "Test";
  return WEBHOOK_EVENTS.find((item) => item.key === event)?.label ?? event;
}

/** Status shown to people: a pending delivery that already failed once is "Retrying". */
export function deliveryState(delivery: { status: DeliveryStatus; attempts: number }) {
  if (delivery.status === "succeeded") return "delivered" as const;
  if (delivery.status === "failed") return "failed" as const;
  return delivery.attempts > 0 ? ("retrying" as const) : ("queued" as const);
}
