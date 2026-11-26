import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AuthCard, AuthHeading } from "@/components/onboarding/auth-card";
import { PublishScene } from "@/components/onboarding/scenes";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthCard visual={<PublishScene />}>
      <AuthHeading
        title="Create your account"
        description="Create sites, publish content and manage SEO in one place."
      />
      {/* The form reads ?next= and ?email= from the URL, which is request-time data. */}
      <Suspense>
        <SignUpForm />
      </Suspense>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        Already have an account?{" "}
        <Suspense fallback={<span className="text-foreground font-medium">Sign in</span>}>
          <AuthSwitchLink to="/sign-in">Sign in</AuthSwitchLink>
        </Suspense>
      </p>
    </AuthCard>
  );
}
