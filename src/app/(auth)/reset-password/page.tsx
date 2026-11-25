import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthCard, AuthHeading } from "@/components/onboarding/auth-card";
import { KeyScene } from "@/components/onboarding/scenes";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The URL carries a one-time token; keep it out of referrers.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <AuthCard visual={<KeyScene />}>
      <AuthHeading
        title="Choose a new password"
        description="Pick something you don't use anywhere else."
      />
      {/* The form reads the token from the URL, which is request-time data. */}
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
