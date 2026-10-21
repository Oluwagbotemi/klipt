"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/account";

/** Sets a new password with the token from a reset email. */
export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [invalid, setInvalid] = useState(!token || Boolean(params.get("error")));
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (password.length > MAX_PASSWORD) {
      next.password = `Use ${MAX_PASSWORD} characters or fewer.`;
    }
    if (String(form.get("confirm")) !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    if (next.password || next.confirm) return;

    setPending(true);
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setPending(false);
      if (error.code === "INVALID_TOKEN" || error.status === 400) setInvalid(true);
      else setFormError("Couldn't change your password. Try again in a moment.");
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  if (invalid) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <InlineAlert>
          This reset link has expired or was already used. Links work once, for 1 hour.
        </InlineAlert>
        <Button asChild size="lg">
          <Link href="/forgot-password">Get a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      {formError && <InlineAlert>{formError}</InlineAlert>}
      <FormField
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={MAX_PASSWORD}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={errors.password}
        required
        autoFocus
      />
      <FormField
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        maxLength={MAX_PASSWORD}
        error={errors.confirm}
        required
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : "Change password"}
      </Button>
      <p className="text-muted-foreground text-xs">
        Every device signed in to your account will be signed out.
      </p>
    </form>
  );
}
