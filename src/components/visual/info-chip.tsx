import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "hero";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-muted text-foreground",
  accent: "bg-primary-soft text-primary-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  hero: "bg-hero-chip text-hero-foreground",
};

/** A small tinted pill with an icon: status, counts, facts ("Live", "12 pages"). */
export function InfoChip({
  icon: Icon,
  tone = "neutral",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}
