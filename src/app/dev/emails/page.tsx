import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getOutbox } from "@/lib/data/dev-outbox";

export const metadata: Metadata = { title: "Dev outbox", robots: { index: false } };

/** Local development only: emails Klipt would have sent, newest first. */
export default function DevOutboxPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo href="/sites" />
        <p className="text-muted-foreground text-sm">Dev outbox · not sent anywhere</p>
      </header>
      <main id="main" className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <OutboxList />
        </Suspense>
      </main>
    </div>
  );
}

async function OutboxList() {
  const emails = await getOutbox();
  if (!emails) notFound();
  if (emails.length === 0) {
    return (
      <div className="bg-card rounded-2xl border px-5 py-10 text-center">
        <p className="font-medium">No emails yet</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Invite someone, request a password reset or assign an entry, then refresh this page.
        </p>
      </div>
    );
  }
  return (
    <ul className="bg-card divide-y rounded-2xl border" aria-label="Emails">
      {emails.map((email) => (
        <li key={email.id}>
          <a
            href={`/dev/emails/${email.id}`}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-accent/50 focus-visible:ring-ring/50 flex flex-col gap-0.5 px-5 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
          >
            <span className="truncate text-sm font-medium">{email.subject}</span>
            <span className="text-muted-foreground truncate text-xs">
              To {email.to} · {email.kind} ·{" "}
              <time dateTime={email.createdAt}>
                {email.createdAt.replace("T", " ").slice(0, 19)}
              </time>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
