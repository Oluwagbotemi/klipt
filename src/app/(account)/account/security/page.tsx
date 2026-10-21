import type { Metadata } from "next";
import { PasswordForm } from "@/components/account/account-forms";
import { SessionsList } from "@/components/account/sessions-list";
import { SettingsCard } from "@/components/settings/settings-card";
import { getAccountSessions } from "@/lib/data/account";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const sessions = await getAccountSessions();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="Password">
        <PasswordForm />
      </SettingsCard>
      <SettingsCard
        title="Signed-in devices"
        description="Browsers where your account is signed in. Sign out any you don't recognise, then change your password."
      >
        <SessionsList sessions={sessions} />
      </SettingsCard>
    </div>
  );
}
