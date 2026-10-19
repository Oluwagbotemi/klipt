import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { getSite } from "@/lib/data/sites";
import { can } from "@/lib/permissions";
import { PERMISSION_LABELS, PERMISSION_ORDER, ROLE_DESCRIPTIONS } from "@/lib/team";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Roles & permissions · Team" };

const ROLES: SiteRole[] = ["owner", "admin", "editor", "author", "viewer"];

/** What each role can do, generated from the permission matrix the server enforces. */
export default async function RolesPage({ params }: PageProps<"/sites/[siteId]/team/roles">) {
  const { siteId } = await params;
  const site = await getSite(siteId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((role) => (
          <li
            key={role}
            className={cn(
              "bg-card rounded-2xl border p-4",
              role === site.currentUserRole && "border-primary",
            )}
          >
            <p className="text-sm font-semibold">
              {ROLE_LABELS[role]}
              {role === site.currentUserRole && (
                <span className="text-primary font-normal"> · your role</span>
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{ROLE_DESCRIPTIONS[role]}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="matrix-heading" className="bg-card rounded-2xl border">
        <div className="p-5 sm:p-6">
          <h2 id="matrix-heading" className="text-base font-semibold">
            What each role can do
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Authors can also edit, archive and delete their own drafts. Only the owner can give the
            Admin role or change admins.
          </p>
        </div>
        <div
          className="overflow-x-auto border-t"
          tabIndex={0}
          aria-label="Permissions by role (scrolls sideways on small screens)"
        >
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-left text-xs">
              <tr>
                <th scope="col" className="bg-muted sticky left-0 px-5 py-2.5 font-medium sm:px-6">
                  Permission
                </th>
                {ROLES.map((role) => (
                  <th key={role} scope="col" className="px-3 py-2.5 text-center font-medium">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSION_ORDER.map((permission) => (
                <tr key={permission}>
                  <th
                    scope="row"
                    className="bg-card sticky left-0 max-w-48 px-5 py-2.5 text-left font-normal sm:max-w-none sm:px-6"
                  >
                    {PERMISSION_LABELS[permission]}
                  </th>
                  {ROLES.map((role) => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {can(role, permission) ? (
                        <Check className="text-success inline size-4" aria-label="Yes" />
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
