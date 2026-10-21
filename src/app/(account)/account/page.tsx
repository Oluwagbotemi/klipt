import type { Metadata } from "next";
import { EmailForm, NameForm } from "@/components/account/account-forms";
import { AppearancePicker } from "@/components/account/appearance-picker";
import { DeleteAccount } from "@/components/account/delete-account";
import { SettingsCard } from "@/components/settings/settings-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getOwnedSites } from "@/lib/data/account";
import { requireUser } from "@/lib/data/session";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const [user, ownedSites] = await Promise.all([requireUser(), getOwnedSites()]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="Profile">
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
        description="Changes take effect right away: sign in with the new email from then on."
      >
        <EmailForm email={user.email} />
      </SettingsCard>
      <SettingsCard title="Appearance" description="Applies to this browser.">
        <AppearancePicker />
      </SettingsCard>
      <SettingsCard title="Delete account" tone="danger">
        <DeleteAccount email={user.email} ownedSites={ownedSites} />
      </SettingsCard>
    </div>
  );
}
