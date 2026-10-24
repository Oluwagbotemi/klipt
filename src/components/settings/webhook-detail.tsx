"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronDown, Eye, EyeOff, Loader2, Pencil, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteWebhookAction,
  resendDeliveryAction,
  revealSecretAction,
  rotateSecretAction,
  sendTestAction,
  setWebhookEnabledAction,
} from "@/app/(site)/sites/[siteId]/settings/integrations/webhooks/actions";
import { CopyButton } from "@/components/copy-button";
import { WebhookForm } from "@/components/settings/webhook-form";
import { DeliveryStatusBadge } from "@/components/settings/webhook-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { eventLabel, type WebhookDeliverySummary, type WebhookSummary } from "@/lib/webhooks";

/** On/off, send test, edit and delete for one webhook. */
export function WebhookControls({ siteId, webhook }: { siteId: string; webhook: WebhookSummary }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeEdit = useCallback(() => {
    setEditing(false);
    toast.success("Webhook saved.");
  }, []);

  function toggle(enabled: boolean) {
    startTransition(async () => {
      const result = await setWebhookEnabledAction(siteId, webhook.id, enabled);
      if (result.ok) toast.success(enabled ? "Webhook turned on." : "Webhook turned off.");
      else toast.error(result.error);
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestAction(siteId, webhook.id);
      if (!result.ok) toast.error(result.error);
      else if (result.delivered) toast.success("Test event delivered. Your website responded OK.");
      else toast.error("Your website didn't accept the test event. See the delivery below.");
    });
  }

  function remove(event: React.MouseEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await deleteWebhookAction(siteId, webhook.id);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Switch checked={webhook.enabled} onCheckedChange={toggle} disabled={pending} />
        <span>
          <span className="block font-medium">{webhook.enabled ? "On" : "Off"}</span>
          <span className="text-muted-foreground block text-xs">
            {webhook.enabled ? "Events are being sent" : "No events are sent while off"}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={sendTest} disabled={pending || !webhook.enabled}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Send test event
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFormKey((n) => n + 1);
            setEditing(true);
          }}
        >
          <Pencil aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          <WebhookForm
            key={formKey}
            siteId={siteId}
            webhook={webhook}
            onSaved={closeEdit}
            header={
              <DialogHeader icon={Pencil}>
                <DialogTitle>Edit webhook</DialogTitle>
                <DialogDescription>Changes apply to the next event Klipt sends.</DialogDescription>
              </DialogHeader>
            }
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={(open) => !pending && setConfirmDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={Trash2} tone="destructive">
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Klipt stops sending events to {webhook.url} and its delivery history is removed. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Delete webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Reveal, copy and replace the signing secret. */
export function SigningSecret({ siteId, webhookId }: { siteId: string; webhookId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRotate, setConfirmRotate] = useState(false);

  function reveal() {
    startTransition(async () => {
      const result = await revealSecretAction(siteId, webhookId);
      if (result.ok) setSecret(result.secret);
      else toast.error(result.error);
    });
  }

  function rotate(event: React.MouseEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await rotateSecretAction(siteId, webhookId);
      if (result.ok) {
        setSecret(result.secret);
        setConfirmRotate(false);
        toast.success("New signing secret created. Update it on your website.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="signing-secret" className="sr-only">
          Signing secret
        </label>
        <input
          id="signing-secret"
          readOnly
          value={secret ?? "whsec_••••••••••••••••••••••••"}
          onFocus={(event) => secret && event.currentTarget.select()}
          className="border-input bg-muted min-w-0 flex-1 basis-full rounded-lg border px-3 py-2 font-mono text-sm outline-none sm:basis-0"
        />
        {secret ? (
          <>
            <CopyButton value={secret} label="Copy secret" />
            <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
              <EyeOff aria-hidden />
              Hide
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={reveal} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
            Reveal
          </Button>
        )}
      </div>
      <div>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => setConfirmRotate(true)}
        >
          <RefreshCw aria-hidden />
          Generate a new secret
        </Button>
      </div>

      <AlertDialog open={confirmRotate} onOpenChange={(open) => !pending && setConfirmRotate(open)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={RefreshCw} tone="warning">
            <AlertDialogTitle>Replace the signing secret?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Events are signed with the new secret straight away. Until you update it on your
              website, your website will reject them as unverified.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rotate} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Replace secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Recent deliveries with request/response details and resend. */
export function DeliveryLog({
  siteId,
  webhookId,
  deliveries,
}: {
  siteId: string;
  webhookId: string;
  deliveries: WebhookDeliverySummary[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function resend(deliveryId: string) {
    setPendingId(deliveryId);
    startTransition(async () => {
      const result = await resendDeliveryAction(siteId, webhookId, deliveryId);
      setPendingId(null);
      if (!result.ok) toast.error(result.error);
      else if (result.delivered) toast.success("Delivered.");
      else toast.error("Your website didn't accept it. See the newest delivery.");
    });
  }

  if (deliveries.length === 0) {
    return (
      <p className="text-muted-foreground border-card-border border-t px-5 py-8 text-center text-sm sm:px-6">
        Nothing sent yet. Publish something, or use{" "}
        <span className="font-medium">Send test event</span>.
      </p>
    );
  }

  return (
    <ul className="divide-card-border border-card-border divide-y border-t" aria-label="Deliveries">
      {deliveries.map((delivery) => {
        const entry = (delivery.payload.data as { entry?: { title?: string; path?: string } })
          ?.entry;
        return (
          <li key={delivery.id}>
            <details className="group">
              <summary className="hover:bg-accent/40 focus-visible:ring-ring/50 flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                <DeliveryStatusBadge delivery={delivery} />
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block text-sm font-medium">{eventLabel(delivery.event)}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {entry?.title ? `${entry.title} · ${entry.path}` : delivery.event}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {delivery.responseStatus ? `HTTP ${delivery.responseStatus} · ` : ""}
                  <time dateTime={delivery.lastAttemptAt ?? delivery.createdAt}>
                    {formatDateTime(delivery.lastAttemptAt ?? delivery.createdAt)}
                  </time>
                </span>
                <ChevronDown
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="flex flex-col gap-3 px-5 pb-4 text-sm sm:px-6">
                <dl className="text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                  <dt>Attempts</dt>
                  <dd>{delivery.attempts}</dd>
                  {delivery.durationMs !== null && (
                    <>
                      <dt>Response time</dt>
                      <dd>{delivery.durationMs} ms</dd>
                    </>
                  )}
                  {delivery.nextAttemptAt && delivery.attempts > 0 && (
                    <>
                      <dt>Next try</dt>
                      <dd>{formatDateTime(delivery.nextAttemptAt)} or soon after</dd>
                    </>
                  )}
                  <dt>Delivery ID</dt>
                  <dd className="font-mono break-all">{delivery.id}</dd>
                </dl>
                {delivery.error && (
                  <p className="text-destructive bg-destructive/5 rounded-lg px-3 py-2 text-xs">
                    {delivery.error}
                  </p>
                )}
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium">Sent</p>
                    <pre className="bg-muted max-h-64 overflow-auto rounded-lg px-3 py-2 font-mono text-xs">
                      {JSON.stringify(delivery.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium">Your website replied</p>
                    <pre className="bg-muted max-h-64 overflow-auto rounded-lg px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                      {delivery.responseBody || (delivery.attempts ? "(empty)" : "(not sent yet)")}
                    </pre>
                  </div>
                </div>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resend(delivery.id)}
                    disabled={pendingId !== null}
                  >
                    {pendingId === delivery.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw aria-hidden />
                    )}
                    Resend
                  </Button>
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
