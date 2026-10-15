import { CommandMenu } from "@/components/shell/command-menu";
import { MobileSiteNav } from "@/components/shell/mobile-site-nav";
import { OpenSitesBar } from "@/components/shell/open-sites-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/data/session";
import { getSite, getSites } from "@/lib/data/sites";

/**
 * Top bar shared by every signed-in page: open-site tabs on the left, search,
 * theme and account on the right. On a site page it also carries the menu
 * button that opens section navigation below the lg breakpoint.
 */
export async function AppTopBar({ siteId }: { siteId?: Promise<string> }) {
  const [user, sites, site] = await Promise.all([
    requireUser(),
    getSites(),
    siteId ? siteId.then(getSite) : null,
  ]);
  const barSites = sites.map(({ id, name, domain }) => ({ id, name, domain }));

  return (
    <OpenSitesBar
      userId={user.id}
      sites={barSites}
      leading={
        site ? (
          <MobileSiteNav siteId={site.id} siteName={site.name} role={site.currentUserRole} />
        ) : undefined
      }
    >
      <CommandMenu
        sites={barSites}
        current={
          site ? { siteId: site.id, siteName: site.name, role: site.currentUserRole } : undefined
        }
      />
      <ThemeToggle className={site ? "hidden sm:inline-flex" : undefined} />
      <UserMenu user={user} />
    </OpenSitesBar>
  );
}

export function AppTopBarSkeleton() {
  return (
    <div className="flex h-14 items-center gap-2 px-2 sm:px-3" aria-hidden>
      <Skeleton className="size-9" />
      <Skeleton className="h-9 w-44" />
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-9 w-9 sm:w-56" />
        <Skeleton className="size-9 rounded-full" />
      </div>
    </div>
  );
}
