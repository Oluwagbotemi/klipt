import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { PermissionDenied } from "@/components/permission-denied";
import { SettingsCard } from "@/components/settings/settings-card";
import { GeneralForm } from "@/components/settings/settings-forms";
import { getSiteSettings } from "@/lib/data/settings";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettingsPage({
  params,
}: PageProps<"/sites/[siteId]/settings">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.update")) {
    return (
      <PermissionDenied area="Settings" role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }
  const settings = await getSiteSettings(site.id);
  const timeZones = Intl.supportedValuesOf("timeZone");
  if (!timeZones.includes(settings.timezone)) timeZones.unshift(settings.timezone);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="General">
        <GeneralForm
          siteId={site.id}
          initial={{
            name: settings.name,
            language: settings.language,
            timezone: settings.timezone,
          }}
          timeZones={timeZones}
        />
      </SettingsCard>
      <SettingsCard
        title="Site ID"
        description="Identifies this site in support requests and integrations."
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-muted min-w-0 flex-1 basis-full rounded-lg px-3 py-2 font-mono text-sm break-all sm:basis-0">
            {site.id}
          </code>
          <CopyButton value={site.id} label="Copy ID" />
        </div>
      </SettingsCard>
    </div>
  );
}
