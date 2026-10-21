"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Asks for a reset link. Shows the same confirmation whether or not an
 * account exists, so the page never reveals who has an account.
 */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "Something went wrong. Try again in a moment.",
      );
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div role="status" className="mt-6 flex flex-col gap-3">
        <p className="bg-success-soft text-success flex gap-2 rounded-xl px-4 py-3 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            If an account uses <span className="font-medium break-all">{sentTo}</span>, we&apos;ve
            sent it a link to choose a new password. The link expires in 1 hour.
          </span>
        </p>
        <p className="text-muted-foreground text-sm">
          Nothing arrived after a few minutes? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-foreground focus-visible:ring-ring/50 rounded font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      {params.get("error") && !error && (
        <InlineAlert>
          That reset link has expired or was already used. Ask for a new one.
        </InlineAlert>
      )}
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        defaultValue={params.get("email") ?? undefined}
        maxLength={254}
        required
        autoFocus
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
