import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { isEmailEnabled } from "@/lib/data/email";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Welcome back. Sign in to manage your sites.
      </p>
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
    </>
  );
}

async function SignIn() {
  // Whether email (and so password reset) is set up is decided at request time.
  await connection();
  return <SignInForm forgotPassword={isEmailEnabled()} />;
}
