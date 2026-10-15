import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo href="/sign-in" />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:pt-16">
        <div className="bg-background w-full max-w-sm rounded-3xl border p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
