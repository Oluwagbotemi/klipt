"use client";

import { useState, useTransition } from "react";
import {
  Clock,
  Link2,
  Loader2,
  LogOut,
  Mail,
  MailX,
  MoreHorizontal,
  RefreshCw,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelInvitationAction,
  changeRoleAction,
  invitationLinkAction,
  removeMemberAction,
  renewInvitationAction,
  resendInvitationEmailAction,
} from "@/app/(site)/sites/[siteId]/team/actions";
import { InviteDialog } from "@/components/team/invite-dialog";
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
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  assignableRoles,
  canManageMember,
  type Team,
  type TeamInvitation,
  type TeamMember,
} from "@/lib/team";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";
import { initials } from "@/lib/utils";

type Confirm =
  | { kind: "remove"; member: TeamMember }
  | { kind: "leave"; member: TeamMember }
  | { kind: "cancel"; invitation: TeamInvitation };

/** Members with their roles, pending invitations, and the actions the viewer may take. */
export function TeamMembers({
  siteId,
  siteName,
  team,
  me,
  emailEnabled,
}: {
  siteId: string;
  siteName: string;
  team: Team;
  me: { userId: string; role: SiteRole };
  emailEnabled: boolean;
}) {
  const [inviting, setInviting] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, startTransition] = useTransition();
  const roles = assignableRoles(me.role);
  const canInvite = can(me.role, "members.manage") && roles.length > 0;

  function run<T extends { ok: boolean }>(
    action: () => Promise<T | { ok: false; error: string }>,
    success: (result: T) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) success(result as T);
      else toast.error((result as { error: string }).error);
    });
  }

  async function copy(url: string, message: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(message);
    } catch {
      toast.message("Copy this link", { description: url });
    }
  }

  function openInvite() {
    setInviteKey((n) => n + 1);
    setInviting(true);
  }

  function confirmAction(event: React.MouseEvent) {
    event.preventDefault();
    if (!confirm) return;
    if (confirm.kind === "cancel") {
      run(
        () => cancelInvitationAction(siteId, confirm.invitation.id),
        () => {
          toast.success(`Cancelled the invitation for ${confirm.invitation.email}.`);
          setConfirm(null);
        },
      );
    } else {
      run(
        () => removeMemberAction(siteId, confirm.member.userId),
        () => {
          toast.success(
            confirm.kind === "leave" ? `You left ${siteName}.` : `Removed ${confirm.member.name}.`,
          );
          setConfirm(null);
        },
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <section aria-labelledby="members-heading" className="bg-card rounded-2xl border">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 id="members-heading" className="text-base font-semibold">
              Members{" "}
              <span className="text-muted-foreground font-normal">({team.members.length})</span>
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              People who can work on {siteName}. Changes apply immediately.
            </p>
          </div>
          {canInvite && (
            <Button onClick={openInvite}>
              <UserPlus aria-hidden />
              Invite member
            </Button>
          )}
        </div>
        <ul className="divide-y border-t" aria-label="Members">
          {team.members.map((member) => {
            const self = member.userId === me.userId;
            const manageable = canManageMember(me, member);
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6"
              >
                <span
                  aria-hidden
                  className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                >
                  {initials(member.name)}
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-medium">
                    {member.name}{" "}
                    {self && <span className="text-muted-foreground font-normal">(you)</span>}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{member.email}</p>
                </div>
                <p className="text-muted-foreground hidden text-xs md:block">
                  Joined {formatDate(member.joinedAt)}
                </p>
                {manageable ? (
                  <>
                    <label htmlFor={`role-${member.userId}`} className="sr-only">
                      Role for {member.name}
                    </label>
                    <select
                      id={`role-${member.userId}`}
                      value={member.role}
                      disabled={pending}
                      onChange={(e) => {
                        const role = e.target.value as SiteRole;
                        run(
                          () => changeRoleAction(siteId, member.userId, role),
                          () => toast.success(`${member.name} is now ${ROLE_LABELS[role]}.`),
                        );
                      }}
                      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border px-2 text-sm outline-none focus-visible:ring-[3px]"
                    >
                      {[...new Set<SiteRole>([...roles, member.role])].map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {ROLE_LABELS[member.role]}
                  </Badge>
                )}
                {(manageable || (self && member.role !== "owner")) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${member.name}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setConfirm({ kind: self ? "leave" : "remove", member })}
                      >
                        {self ? "Leave site" : "Remove from site"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {team.invitations && (
        <section aria-labelledby="invites-heading" className="bg-card rounded-2xl border">
          <div className="p-5 sm:p-6">
            <h2 id="invites-heading" className="text-base font-semibold">
              Pending invitations
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Links you&apos;ve created that haven&apos;t been accepted yet.
            </p>
          </div>
          {team.invitations.length === 0 ? (
            <p className="text-muted-foreground border-t px-5 py-6 text-sm sm:px-6">
              No pending invitations.{canInvite && " Use Invite member to add someone."}
            </p>
          ) : (
            <ul className="divide-y border-t" aria-label="Pending invitations">
              {team.invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                      {invitation.expired ? (
                        <span className="text-warning flex items-center gap-1">
                          <Clock className="size-3" aria-hidden />
                          Expired
                        </span>
                      ) : (
                        <span>Expires {formatDate(invitation.expiresAt)}</span>
                      )}
                      {invitation.invitedByName && (
                        <span>· Invited by {invitation.invitedByName}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline">{ROLE_LABELS[invitation.role]}</Badge>
                  <div className="flex gap-1">
                    {emailEnabled && !invitation.expired && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        aria-label={`Resend email to ${invitation.email}`}
                        onClick={() =>
                          run(
                            () => resendInvitationEmailAction(siteId, invitation.id),
                            () =>
                              toast.success(`Emailed the invitation to ${invitation.email} again.`),
                          )
                        }
                      >
                        <Mail aria-hidden />
                        <span className="hidden sm:inline">Resend email</span>
                      </Button>
                    )}
                    {!invitation.expired && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run<{ ok: true; url: string }>(
                            () => invitationLinkAction(siteId, invitation.id),
                            (result) => void copy(result.url, "Invitation link copied."),
                          )
                        }
                      >
                        <Link2 aria-hidden />
                        Copy link
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`New link for ${invitation.email}`}
                      onClick={() =>
                        run<{ ok: true; url: string; emailed: boolean }>(
                          () => renewInvitationAction(siteId, invitation.id),
                          (result) =>
                            void copy(
                              result.url,
                              result.emailed
                                ? `New link copied and emailed to ${invitation.email}. The old link no longer works.`
                                : "New link copied. The old link no longer works.",
                            ),
                        )
                      }
                    >
                      <RefreshCw aria-hidden />
                      <span className="hidden sm:inline">New link</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      onClick={() => setConfirm({ kind: "cancel", invitation })}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={inviting} onOpenChange={setInviting}>
        <InviteDialog
          key={inviteKey}
          siteId={siteId}
          siteName={siteName}
          roles={roles}
          emailEnabled={emailEnabled}
          onInviteAnother={() => setInviteKey((n) => n + 1)}
        />
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !pending && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader
            icon={
              confirm?.kind === "cancel" ? MailX : confirm?.kind === "leave" ? LogOut : UserMinus
            }
            tone="destructive"
          >
            <AlertDialogTitle>
              {confirm?.kind === "cancel"
                ? "Cancel this invitation?"
                : confirm?.kind === "remove"
                  ? `Remove ${confirm.member.name}?`
                  : `Leave ${siteName}?`}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              {confirm?.kind === "cancel" && (
                <>
                  The link for {confirm.invitation.email} stops working. You can invite them again
                  later.
                </>
              )}
              {confirm?.kind === "remove" && (
                <>
                  They lose access to {siteName} right away. Their content stays. You can invite
                  them again later.
                </>
              )}
              {confirm?.kind === "leave" && (
                <>
                  You&apos;ll lose access right away. To come back, someone will need to invite you
                  again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmAction} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirm?.kind === "cancel"
                ? "Cancel invitation"
                : confirm?.kind === "leave"
                  ? "Leave site"
                  : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
