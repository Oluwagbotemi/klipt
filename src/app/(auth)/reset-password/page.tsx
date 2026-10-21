import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The URL carries a one-time token; keep it out of referrers.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Pick something you don&apos;t use anywhere else.
      </p>
      {/* The form reads the token from the URL, which is request-time data. */}
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
