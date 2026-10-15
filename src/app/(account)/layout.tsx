import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { SkipLink } from "@/components/shell/skip-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/data/session";

/** Account-level shell: sites list and (later) profile, security, notifications. */
export default function AccountLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Suspense fallback={<Skeleton className="size-10 rounded-full" />}>
            <AccountMenu />
          </Suspense>
        </div>
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

async function AccountMenu() {
  const user = await requireUser();
  return <UserMenu user={user} />;
}
