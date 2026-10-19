"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { acceptInvitationAction } from "@/app/(auth)/invite/[token]/actions";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitation({ token, siteName }: { token: string; siteName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Joining…" : `Join ${siteName}`}
      </Button>
    </div>
  );
}

/** Signs out, then returns to the invitation so the right account can sign in. */
export function SignOutButton({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="lg"
      variant="outline"
      className="mt-4 w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace(next);
        router.refresh();
      }}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      Sign out and use another account
    </Button>
  );
}
