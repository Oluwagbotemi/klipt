"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Webhook } from "lucide-react";
import { WebhookForm } from "@/components/settings/webhook-form";
import { DeliveryStatusBadge } from "@/components/settings/webhook-status";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/visual/card";
import { Illustration } from "@/components/visual/illustration";
import { InfoChip } from "@/components/visual/info-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import {
  DEFAULT_WEBHOOK_EVENTS,
  eventLabel,
  MAX_WEBHOOKS,
  WEBHOOK_EVENT_KEYS,
  webhookHref,
  type WebhookSummary,
} from "@/lib/webhooks";

function eventsSummary(events: string[]) {
  if (WEBHOOK_EVENT_KEYS.every((key) => events.includes(key))) return "All events";
  if (DEFAULT_WEBHOOK_EVENTS.every((key) => events.includes(key))) return "All entry events";
  return events.map(eventLabel).join(", ");
}

/** A site's webhooks: what they listen to and how the last delivery went. */
export function WebhooksPanel({
  siteId,
  webhooks,
}: {
  siteId: string;
  webhooks: WebhookSummary[];
}) {
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const atLimit = webhooks.length >= MAX_WEBHOOKS;

  function openAdd() {
    setFormKey((n) => n + 1);
    setAdding(true);
  }

  return (
    <section aria-labelledby="webhooks-heading" className="visual-card">
      <CardHeader
        id="webhooks-heading"
        title="Webhooks"
        description="Klipt tells your website the moment content is published, edited, moved or taken down, so it can refresh those pages straight away."
        icon={Webhook}
        action={
          webhooks.length > 0 && (
            <Button variant="ink" onClick={openAdd} disabled={atLimit}>
              <Plus aria-hidden />
              Add webhook
            </Button>
          )
        }
      />

      {webhooks.length === 0 ? (
        <div className="border-card-border flex flex-col items-center border-t px-5 py-10 text-center">
          <Illustration scene="connect" className="mb-3" />
          <p className="font-medium">No webhooks yet</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Add your website&apos;s webhook address to get notified about changes instead of
            checking for them.
          </p>
          <Button variant="ink" className="mt-4" onClick={openAdd}>
            <Plus aria-hidden />
            Add webhook
          </Button>
        </div>
      ) : (
        <ul
          className="divide-card-border border-card-border divide-y border-t"
          aria-label="Webhooks"
        >
          {webhooks.map((hook) => (
            <li key={hook.id}>
              <Link
                href={webhookHref(siteId, hook.id)}
                className="group hover:bg-accent/50 focus-visible:ring-ring/50 flex items-center gap-4 px-5 py-3.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-sm">{hook.url}</span>
                    {!hook.enabled && <InfoChip tone="neutral">Off</InfoChip>}
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {hook.description ? `${hook.description} · ` : ""}
                    {eventsSummary(hook.events)}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-2 text-xs sm:flex">
                  {hook.lastDelivery ? (
                    <>
                      <DeliveryStatusBadge delivery={hook.lastDelivery} />
                      <span className="text-muted-foreground">
                        {formatDateTime(hook.lastDelivery.at)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nothing sent yet</span>
                  )}
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {atLimit && (
        <p className="text-muted-foreground border-card-border border-t px-5 py-3 text-xs sm:px-6">
          You&apos;ve reached the limit of {MAX_WEBHOOKS} webhooks. Delete one to add another.
        </p>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="lg">
          <WebhookForm
            key={formKey}
            siteId={siteId}
            header={
              <DialogHeader icon={Webhook}>
                <DialogTitle>Add webhook</DialogTitle>
                <DialogDescription>
                  Klipt will send a signed POST request to this address for each event you choose.
                </DialogDescription>
              </DialogHeader>
            }
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
