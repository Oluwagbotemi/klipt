import { Suspense } from "react";
import { SiteChrome, SiteChromeSkeleton } from "@/components/shell/site-chrome";
import { SkipLink } from "@/components/shell/skip-link";

/**
 * Site shell: persistent sidebar on desktop (lg+), drawer navigation below.
 * The layout itself never awaits params, so the frame stays in the static shell.
 */
export default function SiteLayout({ children, params }: LayoutProps<"/sites/[siteId]">) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink />
      <Suspense fallback={<SiteChromeSkeleton />}>
        <SiteChrome siteId={params.then((p) => p.siteId)} />
      </Suspense>
      <main id="main" className="flex min-w-0 flex-col lg:py-3 lg:pr-3">
        <div className="bg-background flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col lg:min-h-0 lg:rounded-3xl lg:border">
          {children}
        </div>
      </main>
    </div>
  );
}
