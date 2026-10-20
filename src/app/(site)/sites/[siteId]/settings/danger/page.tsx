import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { DangerZone } from "@/components/settings/danger-zone";
import { SettingsCard } from "@/components/settings/settings-card";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Danger zone · Settings" };

export default async function DangerZonePage({
  params,
}: PageProps<"/sites/[siteId]/settings/danger">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.delete")) {
    return (
      <PermissionDenied
        area="Danger zone"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="Danger zone" tone="danger">
        <DangerZone siteId={site.id} siteName={site.name} />
      </SettingsCard>
    </div>
  );
}
