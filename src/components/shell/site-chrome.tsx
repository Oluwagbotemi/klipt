import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { MobileSiteNav } from "@/components/shell/mobile-site-nav";
import { SiteNav } from "@/components/shell/site-nav";
import { SiteSwitcher } from "@/components/shell/site-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, getSite, getSites } from "@/lib/data/sites";

const asideClasses =
  "sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto px-4 pt-5 pb-4 lg:flex";
const mobileHeaderClasses =
  "sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-shell/95 px-2 backdrop-blur lg:hidden";

/**
 * Desktop sidebar + mobile top bar for a selected site. Rendered inside a
 * Suspense boundary because it depends on the site id from the URL.
 */
export async function SiteChrome({ siteId }: { siteId: Promise<string> }) {
  const id = await siteId;
  const [site, sites, user] = await Promise.all([getSite(id), getSites(), getCurrentUser()]);
  if (!site) notFound();

  return (
    <>
      <aside className={asideClasses} aria-label="Sidebar">
        <Logo className="px-1" />
        <SiteSwitcher current={site} sites={sites} />
        <div className="flex-1">
          <SiteNav siteId={site.id} />
        </div>
        <div className="border-sidebar-border flex items-center justify-between gap-2 border-t pt-3">
          <UserMenu user={user} showName className="flex-1" />
          <ThemeToggle />
        </div>
      </aside>

      <header className={mobileHeaderClasses}>
        <MobileSiteNav site={site} sites={sites} />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{site.name}</p>
        <ThemeToggle />
        <UserMenu user={user} />
      </header>
    </>
  );
}

export function SiteChromeSkeleton() {
  return (
    <>
      <div className={asideClasses} aria-hidden>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-[3.25rem] w-full rounded-xl" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className={mobileHeaderClasses} aria-hidden>
        <Skeleton className="size-9" />
        <Skeleton className="h-4 w-32" />
      </div>
    </>
  );
}
