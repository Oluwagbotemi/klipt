import type { Metadata } from "next";
import {
  Check,
  Crown,
  Eye,
  Minus,
  PenLine,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { CardHeader, IconTile, type IconTone } from "@/components/visual/card";
import { InfoChip } from "@/components/visual/info-chip";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";
import { PERMISSION_LABELS, PERMISSION_ORDER, ROLE_DESCRIPTIONS } from "@/lib/team";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Roles & permissions · Team" };

const ROLES: SiteRole[] = ["owner", "admin", "editor", "author", "viewer"];

const ROLE_ICONS: Record<SiteRole, { icon: LucideIcon; tone: IconTone }> = {
  owner: { icon: Crown, tone: "accent" },
  admin: { icon: UserCog, tone: "info" },
  editor: { icon: ShieldCheck, tone: "success" },
  author: { icon: PenLine, tone: "warning" },
  viewer: { icon: Eye, tone: "neutral" },
};

/** What each role can do, generated from the permission matrix the server enforces. */
export default async function RolesPage({ params }: PageProps<"/sites/[siteId]/team/roles">) {
  const { siteId } = await params;
  const site = await getSite(siteId);

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-8">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((role) => (
          <li
            key={role}
            className={cn(
              "visual-card flex h-full flex-col gap-3 p-4 sm:p-5",
              role === site.currentUserRole && "border-primary",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <IconTile icon={ROLE_ICONS[role].icon} tone={ROLE_ICONS[role].tone} />
              {role === site.currentUserRole && <InfoChip tone="accent">Your role</InfoChip>}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {ROLE_LABELS[role]}
                {role === site.currentUserRole && <span className="sr-only"> · your role</span>}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="matrix-heading" className="visual-card">
        <CardHeader
          id="matrix-heading"
          title="What each role can do"
          description="Authors can also edit, archive and delete their own drafts. Only the owner can give the Admin role or change admins."
          icon={ShieldCheck}
          iconTone="neutral"
        />
        <div
          className="border-card-border overflow-x-auto border-t"
          tabIndex={0}
          aria-label="Permissions by role (scrolls sideways on small screens)"
        >
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-card-nested text-muted-foreground text-left text-xs">
              <tr>
                <th
                  scope="col"
                  className="bg-card-nested sticky left-0 px-5 py-2.5 font-medium sm:px-6"
                >
                  Permission
                </th>
                {ROLES.map((role) => (
                  <th key={role} scope="col" className="px-3 py-2.5 text-center font-medium">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-card-border divide-y">
              {PERMISSION_ORDER.map((permission) => (
                <tr key={permission}>
                  <th
                    scope="row"
                    className="bg-surface-card sticky left-0 max-w-48 px-5 py-2.5 text-left font-normal sm:max-w-none sm:px-6"
                  >
                    {PERMISSION_LABELS[permission]}
                  </th>
                  {ROLES.map((role) => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {can(role, permission) ? (
                        <span className="bg-success-soft text-success-strong inline-grid size-6 place-items-center rounded-full">
                          <Check className="size-3.5" aria-label="Yes" />
                        </span>
                      ) : (
                        <Minus className="text-muted-foreground/60 inline size-4" aria-label="No" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
