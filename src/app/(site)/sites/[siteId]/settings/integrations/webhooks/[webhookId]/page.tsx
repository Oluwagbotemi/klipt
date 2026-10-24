import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, KeyRound, Send, Webhook, Zap } from "lucide-react";
import { CardHeader, IconTile } from "@/components/visual/card";
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
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-8">
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
          className="bg-success-soft text-success-strong flex gap-2 rounded-2xl px-4 py-3 text-sm"
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
        className="visual-card flex flex-col gap-5 p-5 sm:p-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={Webhook} />
          <div className="min-w-0">
            <h2 id="webhook-heading" className="font-mono text-base font-semibold break-all">
              {webhook.url}
            </h2>
            {webhook.description && (
              <p className="text-muted-foreground mt-1 text-sm">{webhook.description}</p>
            )}
          </div>
        </div>
        <WebhookControls siteId={site.id} webhook={webhook} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="secret-heading" className="visual-card p-5 sm:p-6">
          <h2 id="secret-heading" className="flex items-center gap-3 text-base font-semibold">
            <IconTile icon={KeyRound} tone="neutral" size="sm" />
            Signing secret
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">
            Each event carries a <code className="font-mono text-xs">Klipt-Signature</code> made
            with this secret. Your website uses it to reject messages that didn&apos;t come from
            Klipt. Keep it private.
          </p>
          <SigningSecret siteId={site.id} webhookId={webhook.id} />
        </section>
        <section aria-labelledby="events-heading" className="visual-card p-5 sm:p-6">
          <h2 id="events-heading" className="flex items-center gap-3 text-base font-semibold">
            <IconTile icon={Zap} tone="neutral" size="sm" />
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

      <section aria-labelledby="deliveries-heading" className="visual-card">
        <CardHeader
          id="deliveries-heading"
          title="Recent deliveries"
          description="The last 25 messages. Failed ones are retried automatically, up to 6 tries over about 15 hours, whenever Klipt is next in use (and at least once a day)."
          icon={Send}
          iconTone="neutral"
        />
        <DeliveryLog siteId={site.id} webhookId={webhook.id} deliveries={deliveries} />
      </section>
    </div>
  );
}
