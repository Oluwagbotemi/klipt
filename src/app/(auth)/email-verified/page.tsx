import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/session";

export const metadata: Metadata = { title: "Email confirmation" };

/** Where confirmation links land. Better Auth adds ?error=… when the link didn't work. */
export default function EmailVerifiedPage({ searchParams }: PageProps<"/email-verified">) {
  return (
    <Suspense>
      <Result searchParams={searchParams} />
    </Suspense>
  );
}

async function Result({ searchParams }: Pick<PageProps<"/email-verified">, "searchParams">) {
  const [{ error }, user] = await Promise.all([searchParams, getCurrentUser()]);
  const next = user
    ? { href: "/account", label: "Go to your account" }
    : { href: "/sign-in", label: "Sign in" };

  if (error) {
    const expired = error === "TOKEN_EXPIRED";
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          {expired ? "This link has expired" : "This link didn't work"}
        </h1>
        <div className="mt-6 flex flex-col gap-4">
          <InlineAlert>
            {expired
              ? "Confirmation links work for 1 hour."
              : "It may be for an email address your account no longer uses."}{" "}
            Send a new one from your account page.
          </InlineAlert>
          <Button asChild size="lg">
            <Link href={user ? "/account" : "/sign-in?next=/account"}>{next.label}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <CheckCircle2 className="text-success size-8" aria-hidden />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Email confirmed</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Thanks. Klipt will send invitations, password resets and updates about your work to this
        address.
      </p>
      <Button asChild size="lg" className="mt-6 w-full">
        <Link href={next.href}>{next.label}</Link>
      </Button>
    </>
  );
}
