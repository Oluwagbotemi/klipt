import { cn, initials } from "@/lib/utils";

/** Neutral monogram tile for a site. Purple is reserved for primary actions and selection. */
export function SiteAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-background text-foreground grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-semibold",
        className,
      )}
    >
      {initials(name.replace(/&/g, ""))}
    </span>
  );
}
