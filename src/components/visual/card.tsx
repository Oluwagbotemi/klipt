import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Cards for in-page content: white, 20px radius, no border, soft shadow, sitting
 * on the grey canvas. Nested groups use VisualNested (grey, 14px) with white
 * cards inside, like the modals.
 */

export function VisualCard({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("visual-card flex min-w-0 flex-col", className)} {...props}>
      {children}
    </section>
  );
}

export function VisualNested({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("visual-nested", className)} {...props} />;
}

const ICON_TONES = {
  accent: "bg-primary-soft text-primary-strong",
  neutral: "bg-muted text-foreground",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  hero: "bg-hero-chip text-hero-foreground",
} as const;

export type IconTone = keyof typeof ICON_TONES;

/** A rounded-square icon tile, the recognisable mark of a card or row. */
export function IconTile({
  icon: Icon,
  tone = "accent",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "md" ? "size-9 rounded-xl" : "size-7 rounded-lg",
        ICON_TONES[tone],
        className,
      )}
    >
      <Icon className={size === "md" ? "size-4.5" : "size-3.5"} />
    </span>
  );
}

/** The round "open" arrow in a card's top-right corner. */
export function ArrowButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "visual-arrow border-border bg-card text-foreground hover:bg-accent focus-visible:ring-ring/50 grid size-9 shrink-0 place-items-center rounded-full border outline-none focus-visible:ring-[3px]",
        className,
      )}
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Title (+ optional description) on the left; arrow or controls on the right. */
export function CardHeader({
  id,
  title,
  description,
  icon,
  iconTone,
  href,
  hrefLabel,
  action,
  className,
}: {
  /** Heading id, for the card's aria-labelledby. */
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  iconTone?: IconTone;
  href?: string;
  /** Accessible name of the arrow link, e.g. "Open all content". */
  hrefLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 p-5 sm:p-6", className)}>
      {icon && <IconTile icon={icon} tone={iconTone} />}
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-base leading-tight font-semibold">
          {title}
        </h2>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action}
      {href && <ArrowButton href={href} label={hrefLabel ?? `Open ${String(title)}`} />}
    </div>
  );
}
