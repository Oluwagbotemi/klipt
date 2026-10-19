import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { PermissionDenied } from "@/components/permission-denied";
import { DeliveryLog, SigningSecret, WebhookControls } from "@/components/settings/webhook-detail";
import { getSite } from "@/lib/data/sites";
import { getWebhookDetail, scheduleWebhookDelivery } from "@/lib/data/webhooks";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { eventLabel, WEBHOOK_EVENTS, webhookHref } from "@/lib/webhooks";

export const metadata: Metadata = { title: "Webhook · Integrations" };

export default async function WebhookPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/settings/integrations/webhooks/[webhookId]">) {
  const [{ siteId, webhookId }, query] = await Promise.all([params, searchParams]);
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "webhooks.manage")) {
    return (
      <PermissionDenied
        area="Integrations"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const { webhook, deliveries } = await getWebhookDetail(site.id, webhookId);
  // Retries due since the last visit go out after this page is sent.
  scheduleWebhookDelivery(site.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <Link
        href={webhookHref(site.id)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex w-fit items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Integrations
      </Link>

      {query.created && (
        <div
          role="status"
          className="bg-success-soft text-success flex gap-2 rounded-xl px-4 py-3 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Webhook added. Copy the signing secret below into your website so it can check that
            events really come from Klipt, then send a test event.
          </p>
        </div>
      )}

      <section
        aria-labelledby="webhook-heading"
        className="bg-card flex flex-col gap-5 rounded-2xl border p-5 sm:p-6"
      >
        <div className="min-w-0">
          <h2 id="webhook-heading" className="font-mono text-base font-semibold break-all">
            {webhook.url}
          </h2>
          {webhook.description && (
            <p className="text-muted-foreground mt-1 text-sm">{webhook.description}</p>
          )}
        </div>
        <WebhookControls siteId={site.id} webhook={webhook} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="secret-heading" className="bg-card rounded-2xl border p-5 sm:p-6">
          <h2 id="secret-heading" className="text-base font-semibold">
            Signing secret
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">
            Each event carries a <code className="font-mono text-xs">Klipt-Signature</code> made
            with this secret. Your website uses it to reject messages that didn&apos;t come from
            Klipt. Keep it private.
          </p>
          <SigningSecret siteId={site.id} webhookId={webhook.id} />
        </section>
        <section aria-labelledby="events-heading" className="bg-card rounded-2xl border p-5 sm:p-6">
          <h2 id="events-heading" className="text-base font-semibold">
            Events
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {WEBHOOK_EVENTS.filter((event) => webhook.events.includes(event.key)).map((event) => (
              <li key={event.key}>
                <span className="font-medium">{eventLabel(event.key)}</span>{" "}
                <code className="text-muted-foreground font-mono text-xs">{event.key}</code>
                <span className="text-muted-foreground block text-xs">{event.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="deliveries-heading" className="bg-card rounded-2xl border">
        <div className="p-5 sm:p-6">
          <h2 id="deliveries-heading" className="text-base font-semibold">
            Recent deliveries
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            The last 25 messages. Failed ones are retried automatically, up to 6 tries over about 15
            hours, whenever Klipt is next in use (and at least once a day).
          </p>
        </div>
        <DeliveryLog siteId={site.id} webhookId={webhook.id} deliveries={deliveries} />
      </section>
    </div>
  );
}
