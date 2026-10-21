"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** `forgotPassword` shows the reset link; only when this Klipt can send email. */
export function SignInForm({ forgotPassword = false }: { forgotPassword?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));
  const notice =
    params.get("deleted") === "1"
      ? "Your account was deleted."
      : params.get("reset") === "1"
        ? "Your password was changed. Sign in with your new password."
        : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    if (error) {
      setPending(false);
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That email and password don't match an account. Check them and try again.",
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      {!error && notice && (
        <p role="status" className="bg-success-soft text-success rounded-xl px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        defaultValue={params.get("email") ?? undefined}
        required
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {forgotPassword && (
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -mt-2 self-end rounded text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
        >
          Forgot password?
        </Link>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
