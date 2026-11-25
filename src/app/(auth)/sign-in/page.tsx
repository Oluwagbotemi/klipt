import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthCard, AuthHeading } from "@/components/onboarding/auth-card";
import { PublishScene } from "@/components/onboarding/scenes";
import { isEmailEnabled } from "@/lib/data/email";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthCard visual={<PublishScene />}>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to manage your sites." />
      {/* The form reads ?next= from the URL, which is request-time data. */}
      <Suspense>
        <SignIn />
      </Suspense>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        New to Klipt?{" "}
        <Suspense fallback={<span className="text-foreground font-medium">Create an account</span>}>
          <AuthSwitchLink to="/sign-up">Create an account</AuthSwitchLink>
        </Suspense>
      </p>
    </AuthCard>
  );
}

async function SignIn() {
  // Whether email (and so password reset) is set up is decided at request time.
  await connection();
  return <SignInForm forgotPassword={isEmailEnabled()} />;
}
