"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  saveWebhookAction,
  type WebhookFormState,
} from "@/app/(site)/sites/[siteId]/settings/integrations/webhooks/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogClose, DialogFooter, DialogForm } from "@/components/ui/dialog";
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENTS, type WebhookSummary } from "@/lib/webhooks";

/**
 * Add or edit a webhook inside a DialogContent: renders the given header, the
 * fields in the modal body and the footer. `onSaved` closes it after an edit.
 */
export function WebhookForm({
  siteId,
  webhook,
  header,
  onSaved,
}: {
  siteId: string;
  webhook?: WebhookSummary;
  header: React.ReactNode;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveWebhookAction, {
    values: {
      url: webhook?.url ?? "",
      description: webhook?.description ?? "",
      events: webhook?.events ?? [...DEFAULT_WEBHOOK_EVENTS],
    },
  } satisfies WebhookFormState);

  useEffect(() => {
    if (state.saved) onSaved?.();
  }, [state, onSaved]);

  const eventsError = state.errors?.events;

  return (
    <DialogForm action={formAction}>
      {header}
      <DialogBody>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        {webhook && <input type="hidden" name="webhookId" value={webhook.id} />}
        <FormField
          id="webhook-url"
          name="url"
          label="Endpoint URL"
          type="url"
          inputMode="url"
          defaultValue={state.values.url}
          error={state.errors?.url}
          hint="An address on your website that accepts POST requests, e.g. https://myblog.com/api/klipt-webhook."
          autoComplete="off"
          spellCheck={false}
          required
          autoFocus
        />
        <FormField
          id="webhook-description"
          name="description"
          label="Description"
          defaultValue={state.values.description}
          error={state.errors?.description}
          hint="A note for your team, e.g. Refresh blog pages."
          maxLength={120}
          autoComplete="off"
        />
        <fieldset
          className="grid gap-2"
          aria-describedby={eventsError ? "webhook-events-error" : undefined}
        >
          <legend className="mb-1 text-sm font-medium">Events to send</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label
              key={event.key}
              className="hover:bg-accent/50 has-focus-visible:ring-ring/50 flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:ring-[3px]"
            >
              <input
                type="checkbox"
                name="events"
                value={event.key}
                defaultChecked={state.values.events.includes(event.key)}
                className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer outline-none"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {event.label}{" "}
                  <code className="text-muted-foreground font-mono text-xs font-normal">
                    {event.key}
                  </code>
                </span>
                <span className="text-muted-foreground block text-xs">{event.description}</span>
              </span>
            </label>
          ))}
          {eventsError && (
            <p id="webhook-events-error" className="text-destructive text-sm">
              {eventsError}
            </p>
          )}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {webhook ? (pending ? "Saving…" : "Save changes") : pending ? "Adding…" : "Add webhook"}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
