import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isEmailEnabled } from "@/lib/data/email";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <Suspense>
        <ForgotPassword />
      </Suspense>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="text-foreground focus-visible:ring-ring/50 rounded font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

async function ForgotPassword() {
  // Whether email is set up is decided per deployment, at request time.
  await connection();
  if (!isEmailEnabled()) {
    return (
      <p className="text-muted-foreground mt-2 text-sm">
        Password reset by email isn&apos;t set up on this Klipt yet. Ask whoever runs it to add an
        email provider (see docs/email.md), or to help you get back in.
      </p>
    );
  }
  return (
    <>
      <p className="text-muted-foreground mt-1 text-sm">
        Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
