import type { LucideIcon } from "lucide-react";
import { HatchPattern } from "@/components/visual/hatch-pattern";
import { InfoChip } from "@/components/visual/info-chip";
import { cn } from "@/lib/utils";

/**
 * The one dark highlight card a screen may have: an eyebrow chip, a bold
 * display title, a short line and up to two actions. A geometric vector sits in
 * the corner (decorative).
 */
export function HeroCard({
  id,
  eyebrow,
  eyebrowIcon,
  title,
  description,
  meta,
  children,
  className,
}: {
  /** Heading id, for aria-labelledby. */
  id: string;
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small facts under the description (chips). */
  meta?: React.ReactNode;
  /** Actions: use HeroAction. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "bg-hero text-hero-foreground border-hero-border relative isolate flex min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-card) border p-6",
        className,
      )}
    >
      <HeroVector />
      <InfoChip tone="hero" icon={eyebrowIcon} className="self-start">
        {eyebrow}
      </InfoChip>
      <div className="flex min-w-0 flex-col gap-2">
        <h2
          id={id}
          className="text-2xl leading-[1.1] font-extrabold tracking-tight break-words sm:text-[1.75rem]"
        >
          {title}
        </h2>
        {description && <p className="text-hero-muted text-sm">{description}</p>}
      </div>
      {meta && <div className="flex flex-wrap gap-2">{meta}</div>}
      {children && <div className="mt-auto flex flex-wrap gap-2 pt-1">{children}</div>}
    </section>
  );
}

/** Pill actions on the dark card: light (primary) or translucent (secondary). */
export function heroActionClass(kind: "primary" | "secondary" = "primary") {
  return cn(
    "focus-visible:ring-hero-foreground/50 inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-60 [&_svg]:size-4",
    kind === "primary"
      ? "bg-hero-foreground text-hero hover:bg-hero-foreground/90"
      : "bg-hero-chip text-hero-foreground hover:bg-hero-foreground/20",
  );
}

function HeroVector() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 160"
      className="visual-fade pointer-events-none absolute -top-14 -right-14 -z-10 size-44 opacity-90"
      fill="none"
    >
      <defs>
        <HatchPattern id="klipt-hero-hatch" className="stroke-hero-foreground/15" />
      </defs>
      <circle cx="96" cy="64" r="62" fill="url(#klipt-hero-hatch)" />
      <circle cx="96" cy="64" r="40" className="stroke-hero-foreground/15" strokeWidth="1.5" />
      <circle cx="96" cy="64" r="22" className="fill-primary" />
      <circle cx="58" cy="112" r="8" className="fill-hero-foreground/20" />
    </svg>
  );
}
