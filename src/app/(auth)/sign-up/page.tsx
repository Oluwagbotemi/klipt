import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Create sites, publish content and manage SEO in one place.
      </p>
      <SignUpForm />
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
