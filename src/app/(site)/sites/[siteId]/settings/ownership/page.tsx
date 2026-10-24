import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { OwnershipPanel } from "@/components/settings/ownership-panel";
import { ArrowRightLeft, Crown, History } from "lucide-react";
import { initials } from "@/lib/utils";
import { SettingsCard } from "@/components/settings/settings-card";
import { isEmailEnabled } from "@/lib/data/email";
import { getOwnership } from "@/lib/data/settings";
import { getSite } from "@/lib/data/sites";
import { getTeam } from "@/lib/data/team";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Ownership · Settings" };

const STATUS: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  failed: "Failed",
};

export default async function OwnershipPage({
  params,
}: PageProps<"/sites/[siteId]/settings/ownership">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.transfer_ownership")) {
    return (
      <PermissionDenied area="Ownership" role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }
  const [ownership, team] = await Promise.all([getOwnership(site.id), getTeam(site.id)]);

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-4">
        <SettingsCard title="Current owner" icon={Crown}>
          <div className="visual-nested flex items-center gap-3 p-3">
            <span
              aria-hidden
              className="bg-primary-soft text-primary-strong grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
            >
              {initials(ownership.owner.name)}
            </span>
            <p className="min-w-0 text-sm">
              <span className="block truncate font-medium">{ownership.owner.name}</span>
              <span className="text-muted-foreground block truncate">{ownership.owner.email}</span>
            </p>
          </div>
          <p className="text-muted-foreground mt-3 text-sm">
            The owner has full control of {site.name}, including transferring and deleting it. This
            is ownership of the site only, not of anyone&apos;s Klipt account.
          </p>
        </SettingsCard>

        <div>
          <SettingsCard
            icon={ArrowRightLeft}
            title="Transfer ownership"
            description={
              <>
                Hand {site.name} to someone else, such as a client. They must accept before anything
                changes. Domains, hosting and other services you set up outside Klipt don&apos;t
                move with the site; hand those over separately.
              </>
            }
          >
            <OwnershipPanel
              siteId={site.id}
              siteName={site.name}
              pending={ownership.pending}
              emailEnabled={isEmailEnabled()}
              members={team.members
                .filter((member) => member.role !== "owner")
                .map((member) => ({ email: member.email, name: member.name }))}
            />
          </SettingsCard>
        </div>
      </div>

      {ownership.history.length > 0 && (
        <SettingsCard title="Transfer history" icon={History}>
          <ul className="divide-card-border divide-y text-sm">
            {ownership.history.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 break-all">{item.recipientEmail}</span>
                <span className="text-muted-foreground">
                  {STATUS[item.status] ?? item.status} ·{" "}
                  {formatDate(item.respondedAt ?? item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </div>
  );
}
