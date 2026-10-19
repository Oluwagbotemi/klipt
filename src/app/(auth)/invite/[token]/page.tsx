import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { AcceptInvitation, SignOutButton } from "@/components/team/accept-invitation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getInvitation } from "@/lib/data/team";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTIONS } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
    >
      <Invitation params={params} />
    </Suspense>
  );
}

async function Invitation({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const { preview, user } = await getInvitation(token);
  const here = `/invite/${token}`;

  if (preview.state !== "open") {
    const copy = {
      invalid: {
        title: "This invitation link isn't valid",
        text: "It may have been cancelled or replaced by a newer link. Ask the person who invited you to send a new one.",
      },
      expired: {
        title: "This invitation has expired",
        text: `Invitations to ${"siteName" in preview ? preview.siteName : "a site"} last 7 days. Ask the person who invited you for a new link.`,
      },
      accepted: {
        title: "This invitation was already used",
        text: `If you accepted it, ${"siteName" in preview ? preview.siteName : "the site"} is in your sites.`,
      },
    }[preview.state];
    return (
      <>
        <CircleAlert className="text-muted-foreground mb-3 size-6" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{copy.text}</p>
        <Button asChild className="mt-6 w-full">
          <Link href="/sites">Go to Klipt</Link>
        </Button>
      </>
    );
  }

  const role = ROLE_LABELS[preview.role];
  const intro = (
    <>
      <p className="text-muted-foreground text-sm">You&apos;re invited to</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{preview.siteName}</h1>
      <p className="mt-3 text-sm">
        {preview.invitedByName ?? "A member"} invited <strong>{preview.email}</strong> to join as{" "}
        <strong>{role}</strong>.
      </p>
      <p className="text-muted-foreground mt-1 text-sm">{ROLE_DESCRIPTIONS[preview.role]}</p>
      <p className="text-muted-foreground mt-3 text-xs">Expires {formatDate(preview.expiresAt)}.</p>
    </>
  );

  if (!user) {
    const query = `next=${encodeURIComponent(here)}&email=${encodeURIComponent(preview.email)}`;
    return (
      <>
        {intro}
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={`/sign-up?${query}`}>Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/sign-in?${query}`}>I already have an account</Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Use {preview.email}. You&apos;ll come back here to accept.
        </p>
      </>
    );
  }

  if (user.email.toLowerCase() !== preview.email) {
    return (
      <>
        {intro}
        <div
          role="alert"
          className="border-warning/30 bg-warning-soft text-warning mt-6 rounded-lg border px-3 py-2.5 text-sm"
        >
          You&apos;re signed in as {user.email}. This invitation is for {preview.email}.
        </div>
        <SignOutButton next={here} />
      </>
    );
  }

  return (
    <>
      {intro}
      <AcceptInvitation token={token} siteName={preview.siteName} />
    </>
  );
}
