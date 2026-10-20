"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { respondToTransferAction } from "@/app/(auth)/transfer/[token]/actions";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";

export function TransferResponse({ token, siteName }: { token: string; siteName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [pending, startTransition] = useTransition();

  if (declined) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <p className="text-sm">You declined. {siteName} stays with its current owner.</p>
        <Button asChild variant="outline">
          <Link href="/sites">Go to your sites</Link>
        </Button>
      </div>
    );
  }

  const respond = (answer: "accept" | "decline") =>
    startTransition(async () => {
      setError(null);
      const result = await respondToTransferAction(token, answer);
      if ("error" in result) setError(result.error);
      else setDeclined(true);
    });

  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <InlineAlert>{error}</InlineAlert>}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span>
          I understand I&apos;ll become the owner of {siteName}, responsible for its team, settings
          and content.
        </span>
      </label>
      <Button size="lg" disabled={pending || !understood} onClick={() => respond("accept")}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Accept and become owner
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => respond("decline")}>
        Decline
      </Button>
    </div>
  );
}
