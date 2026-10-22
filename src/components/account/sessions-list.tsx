"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/(account)/account/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccountSession } from "@/lib/account";
import { formatDate } from "@/lib/format";

const isMobile = (device: string) => /iOS|Android/.test(device);

/** Signed-in devices, with sign-out for one or all of the others. */
export function SessionsList({ sessions }: { sessions: AccountSession[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const others = sessions.filter((session) => !session.current);

  function revoke(session: AccountSession) {
    setBusyId(session.id);
    startTransition(async () => {
      const result = await revokeSessionAction(session.id);
      setBusyId(null);
      if (result.ok) toast.success(`Signed out ${session.device}.`);
      else toast.error(result.error);
    });
  }

  function revokeAll(event: React.MouseEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      setConfirmAll(false);
      if (result.ok) {
        toast.success(
          result.count === 1 ? "Signed out 1 device." : `Signed out ${result.count ?? 0} devices.`,
        );
      } else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-xl border" aria-label="Signed-in devices">
        {sessions.map((session) => {
          const Icon = isMobile(session.device) ? Smartphone : Monitor;
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg"
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="truncate">{session.device}</span>
                  {session.current && <Badge variant="secondary">This device</Badge>}
                </p>
                <p className="text-muted-foreground text-xs">
                  {session.ipAddress ? `${session.ipAddress} · ` : ""}Signed in{" "}
                  {formatDate(session.signedInAt)} · Last active {formatDate(session.lastActiveAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => revoke(session)}
                  aria-label={`Sign out ${session.device}, signed in ${formatDate(session.signedInAt)}`}
                >
                  {busyId === session.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <LogOut aria-hidden />
                  )}
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 ? (
        <div>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmAll(true)}>
            <LogOut aria-hidden />
            Sign out all other devices
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">You&apos;re only signed in on this device.</p>
      )}

      <AlertDialog open={confirmAll} onOpenChange={(open) => !pending && setConfirmAll(open)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={LogOut} tone="warning">
            <AlertDialogTitle>Sign out all other devices?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              {others.length === 1 ? "1 other device" : `${others.length} other devices`} will need
              to sign in again. You stay signed in here.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revokeAll} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Sign out others
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
