import { Suspense } from "react";
import { AppTopBar, AppTopBarSkeleton } from "@/components/shell/app-top-bar";
import { SiteSidebar, SiteSidebarPlaceholder } from "@/components/shell/site-sidebar";
import { SkipLink } from "@/components/shell/skip-link";
import { CreateSiteProvider } from "@/components/sites/create-site-dialog";
import { getCollectionTypes } from "@/lib/data/models";
import { getSite } from "@/lib/data/sites";

/**
 * Site shell: open-site tabs across the top, section sidebar on the left
 * (lg+, collapsible), and a rounded working surface. The layout never awaits
 * params, so the frame stays in the static shell while site data streams in.
 */
export default function SiteLayout({ children, params }: LayoutProps<"/sites/[siteId]">) {
  const siteId = params.then((p) => p.siteId);

  return (
    <CreateSiteProvider>
      <div className="flex min-h-dvh flex-col">
        <SkipLink />
        <header className="bg-shell/90 supports-[backdrop-filter]:bg-shell/75 sticky top-0 z-40 border-b backdrop-blur md:border-b-0">
          <Suspense fallback={<AppTopBarSkeleton />}>
            <AppTopBar siteId={siteId} />
          </Suspense>
        </header>
        <div className="flex min-w-0 flex-1">
          <Suspense fallback={<SiteSidebarPlaceholder />}>
            <SidebarLoader siteId={siteId} />
          </Suspense>
          <main id="main" className="flex min-w-0 flex-1 flex-col md:px-3 md:pb-3 lg:pl-0">
            <div className="bg-background flex flex-1 flex-col md:rounded-3xl md:border">
              {children}
            </div>
          </main>
        </div>
      </div>
    </CreateSiteProvider>
  );
}

async function SidebarLoader({ siteId }: { siteId: Promise<string> }) {
  const id = await siteId;
  const [site, collections] = await Promise.all([getSite(id), getCollectionTypes(id)]);
  return <SiteSidebar siteId={site.id} role={site.currentUserRole} collections={collections} />;
}
