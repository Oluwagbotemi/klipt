import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { SignOutButton } from "@/components/team/accept-invitation";
import { TransferResponse } from "@/components/settings/transfer-response";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransfer } from "@/lib/data/settings";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Site ownership transfer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function TransferPage({ params }: PageProps<"/transfer/[token]">) {
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
      <Transfer params={params} />
    </Suspense>
  );
}

const CLOSED: Record<string, string> = {
  accepted: "This transfer was already accepted.",
  declined: "This transfer was declined.",
  cancelled: "The owner cancelled this transfer.",
  expired: "This transfer link has expired. Ask the owner to send a new one.",
};

async function Transfer({ params }: { params: PageProps<"/transfer/[token]">["params"] }) {
  const { token } = await params;
  const { preview, user } = await getTransfer(token);
  const here = `/transfer/${token}`;

  if (preview.state !== "open") {
    return (
      <>
        <CircleAlert className="text-muted-foreground mb-3 size-6" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">
          {preview.state === "invalid" ? "This transfer link isn't valid" : preview.siteName}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {preview.state === "invalid"
            ? "It may have been cancelled or replaced. Ask the site's owner for a new link."
            : (CLOSED[preview.status] ?? "This transfer is closed.")}
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/sites">Go to Klipt</Link>
        </Button>
      </>
    );
  }

  const intro = (
    <>
      <p className="text-muted-foreground text-sm">Site ownership transfer</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{preview.siteName}</h1>
      <p className="mt-3 text-sm">
        {preview.fromName} wants to make <strong>{preview.recipientEmail}</strong> the owner of this
        site{preview.siteDomain ? ` (${preview.siteDomain})` : ""}.
      </p>
      <ul className="text-muted-foreground mt-3 list-disc space-y-1 pl-5 text-sm">
        <li>You get full control: team, settings, integrations, and deleting the site.</li>
        <li>
          {preview.fromName}{" "}
          {preview.previousOwnerRetainsAdmin ? "stays on as Admin." : "leaves the site."}
        </li>
        <li>
          Only the site moves. Domains, hosting and billing outside Klipt need to be handed over
          separately.
        </li>
      </ul>
      <p className="text-muted-foreground mt-3 text-xs">Expires {formatDate(preview.expiresAt)}.</p>
    </>
  );

  if (!user) {
    const query = `next=${encodeURIComponent(here)}&email=${encodeURIComponent(preview.recipientEmail)}`;
    return (
      <>
        {intro}
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={`/sign-in?${query}`}>Sign in to respond</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/sign-up?${query}`}>Create an account</Link>
          </Button>
        </div>
      </>
    );
  }

  if (user.email.toLowerCase() !== preview.recipientEmail) {
    return (
      <>
        {intro}
        <div
          role="alert"
          className="border-warning/30 bg-warning-soft text-warning mt-6 rounded-lg border px-3 py-2.5 text-sm"
        >
          You&apos;re signed in as {user.email}. This transfer is for {preview.recipientEmail}.
        </div>
        <SignOutButton next={here} />
      </>
    );
  }

  return (
    <>
      {intro}
      <TransferResponse token={token} siteName={preview.siteName} />
    </>
  );
}
