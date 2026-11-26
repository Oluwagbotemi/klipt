import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The card every sign-in and welcome screen sits in: Klipt and the form on the
 * left, an illustration of Klipt on the right (from `lg`; phones get the form only).
 */
export function AuthCard({
  visual,
  children,
  wide = false,
  logoHref = "/sign-in",
}: {
  /** A scene from `./scenes`, shown in the grey panel. */
  visual: React.ReactNode;
  children: React.ReactNode;
  /** Wider content column, for the welcome steps' choice cards. */
  wide?: boolean;
  logoHref?: string;
}) {
  return (
    <div className="bg-background grid w-full max-w-[1200px] overflow-hidden rounded-[28px] border lg:min-h-[680px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Logo href={logoHref} />
          <ThemeToggle />
        </div>
        <div
          className={cn(
            "mt-8 flex w-full flex-1 flex-col sm:mt-10 lg:justify-center",
            wide ? "max-w-2xl" : "max-w-md",
          )}
        >
          {children}
        </div>
      </div>
      <div className="hidden p-3 lg:flex" aria-hidden>
        <div className="bg-card-nested relative flex w-full items-center overflow-hidden rounded-[22px]">
          {visual}
        </div>
      </div>
    </div>
  );
}

/** Title + one muted line, the same on every screen. */
export function AuthHeading({
  title,
  description,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div>
      {eyebrow && <p className="text-muted-foreground mb-2 text-sm">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-9">{title}</h1>
      {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
    </div>
  );
}
