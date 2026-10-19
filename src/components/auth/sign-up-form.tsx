"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/safe-redirect";

const MIN_PASSWORD = 8;

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));

    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setPasswordError(undefined);
    setPending(true);
    setError(null);

    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      password,
    });

    if (error) {
      setPending(false);
      setError(
        error.code === "USER_ALREADY_EXISTS" ||
          error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account with that email already exists. Sign in instead."
          : (error.message ?? "We couldn't create your account. Try again."),
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      <FormField
        id="name"
        name="name"
        label="Your name"
        autoComplete="name"
        maxLength={80}
        required
      />
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
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={128}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={passwordError}
        required
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
