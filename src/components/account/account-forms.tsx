"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  changeEmailAction,
  changePasswordAction,
  saveNameAction,
  type AccountFormState,
  type EmailValues,
  type NameValues,
  type PasswordValues,
} from "@/app/(account)/account/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MIN_PASSWORD } from "@/lib/account";

function SaveRow({ pending, saved, label }: { pending: boolean; saved?: boolean; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : label}
      </Button>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {saved && !pending ? "Saved." : ""}
      </p>
    </div>
  );
}

export function NameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(saveNameAction, {
    values: { name },
  } satisfies AccountFormState<NameValues>);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <FormField
        id="account-name"
        name="name"
        label="Name"
        defaultValue={state.values.name}
        error={state.errors?.name}
        hint="Shown to people on your sites' teams."
        autoComplete="name"
        maxLength={80}
        required
      />
      <SaveRow pending={pending} saved={state.saved} label="Save name" />
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, {
    values: { email },
  } satisfies AccountFormState<EmailValues>);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <FormField
        id="account-email"
        name="email"
        type="email"
        label="Email"
        defaultValue={state.values.email}
        error={state.errors?.email}
        hint="You sign in with this email, and invitations to sites are sent to it."
        autoComplete="email"
        maxLength={254}
        required
      />
      <FormField
        id="email-password"
        name="password"
        type="password"
        label="Current password"
        error={state.errors?.password}
        hint="Needed to change your email."
        autoComplete="current-password"
        required
      />
      <SaveRow pending={pending} saved={state.saved} label="Change email" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, {
    values: { revokeOthers: true },
  } satisfies AccountFormState<PasswordValues>);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      {state.saved && !pending && (
        <p role="status" className="bg-success-soft text-success rounded-xl px-4 py-3 text-sm">
          Password changed.
          {state.values.revokeOthers ? " Your other devices were signed out." : ""}
        </p>
      )}
      <FormField
        id="current-password"
        name="currentPassword"
        type="password"
        label="Current password"
        error={state.errors?.currentPassword}
        autoComplete="current-password"
        required
      />
      <FormField
        id="new-password"
        name="newPassword"
        type="password"
        label="New password"
        error={state.errors?.newPassword}
        hint={`At least ${MIN_PASSWORD} characters.`}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        maxLength={128}
        required
      />
      <FormField
        id="confirm-password"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        error={state.errors?.confirmPassword}
        autoComplete="new-password"
        maxLength={128}
        required
      />
      <div className="flex items-start gap-3">
        <Switch
          id="revoke-others"
          name="revokeOthers"
          defaultChecked={state.values.revokeOthers}
          aria-describedby="revoke-others-hint"
          className="mt-0.5"
        />
        <div>
          <label htmlFor="revoke-others" className="text-sm font-medium">
            Sign out other devices
          </label>
          <p id="revoke-others-hint" className="text-muted-foreground text-xs">
            Recommended if you think someone else knows your password.
          </p>
        </div>
      </div>
      <SaveRow pending={pending} label="Change password" />
    </form>
  );
}
