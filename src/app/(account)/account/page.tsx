import { Bell, Mail, Palette, Trash2, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { EmailForm, NameForm } from "@/components/account/account-forms";
import { AppearancePicker } from "@/components/account/appearance-picker";
import { DeleteAccount } from "@/components/account/delete-account";
import { EmailStatus, NotificationsForm } from "@/components/account/email-settings";
import { SettingsCard } from "@/components/settings/settings-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getEmailSettings, getOwnedSites } from "@/lib/data/account";
import { requireUser } from "@/lib/data/session";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const [user, ownedSites, email] = await Promise.all([
    requireUser(),
    getOwnedSites(),
    getEmailSettings(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="Profile" icon={UserRound}>
        <div className="flex flex-col gap-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12 text-base">
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="text-muted-foreground truncate text-sm">{user.email}</p>
            </div>
          </div>
          <NameForm name={user.name} />
        </div>
      </SettingsCard>
      <SettingsCard
        title="Email"
        icon={Mail}
        description={
          email.emailEnabled
            ? "Changes take effect right away: sign in with the new email from then on. We'll send a confirmation link to the new address and let the old one know."
            : "Changes take effect right away: sign in with the new email from then on."
        }
      >
        <div className="flex flex-col gap-5">
          {email.emailEnabled && <EmailStatus email={user.email} verified={email.verified} />}
          <EmailForm email={user.email} />
        </div>
      </SettingsCard>
      {email.emailEnabled && (
        <SettingsCard
          title="Email notifications"
          description={`Emails go to ${user.email}.`}
          icon={Bell}
        >
          <NotificationsForm assignments={email.assignmentEmails} />
        </SettingsCard>
      )}
      <SettingsCard title="Appearance" description="Applies to this browser." icon={Palette}>
        <AppearancePicker />
      </SettingsCard>
      <SettingsCard title="Delete account" tone="danger" icon={Trash2}>
        <DeleteAccount email={user.email} ownedSites={ownedSites} />
      </SettingsCard>
    </div>
  );
}
