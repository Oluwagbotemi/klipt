import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PermissionDenied } from "@/components/permission-denied";
import { getSite } from "@/lib/data/sites";
import { canSeeTab, getSiteNavItem, getSiteTab, siteHref } from "@/lib/navigation";

/**
 * Body for a section page that hasn't been built yet. Authorizes on its own
 * (pages render in parallel with layouts) and shows a no-access state when
 * the member's role doesn't allow the page.
 */
export async function PlannedPage({
  siteId,
  section,
  segment,
}: {
  siteId: string;
  section: string;
  segment: string | null;
}) {
  const item = getSiteNavItem(section);
  const tab = item && getSiteTab(item, segment);
  if (!item || !tab) notFound();

  const site = await getSite(siteId);
  const name = tab.label || item.label;
  if (!canSeeTab(site.currentUserRole, item, tab)) {
    return (
      <PermissionDenied area={name} role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }

  return (
    <EmptyState
      icon={Construction}
      title={`${name} isn't built yet`}
      description="This page is part of the planned product. It will include:"
    >
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {tab.planned.map((entry) => (
          <li key={entry} className="text-muted-foreground rounded-md border px-2.5 py-1 text-xs">
            {entry}
          </li>
        ))}
      </ul>
    </EmptyState>
  );
}
