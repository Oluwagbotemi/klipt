import { Suspense } from "react";
import { AppTopBar, AppTopBarSkeleton } from "@/components/shell/app-top-bar";
import { SkipLink } from "@/components/shell/skip-link";

/** Account-level shell: sites list and (later) profile, security, notifications. */
export default function AccountLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="bg-shell/90 supports-[backdrop-filter]:bg-shell/75 sticky top-0 z-40 backdrop-blur">
        <Suspense fallback={<AppTopBarSkeleton />}>
          <AppTopBar />
        </Suspense>
      </header>
      <main
        id="main"
        className="bg-background flex flex-1 flex-col sm:mx-3 sm:mb-3 sm:rounded-3xl sm:border"
      >
        {children}
      </main>
    </div>
  );
}
