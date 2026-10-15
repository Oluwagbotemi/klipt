import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

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
        <SignInForm />
      </Suspense>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        New to Klipt?{" "}
        <Link href="/sign-up" className="text-foreground font-medium underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
