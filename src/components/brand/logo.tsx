import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/sites" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg text-base font-semibold tracking-tight outline-none focus-visible:ring-[3px]",
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm font-bold"
      >
        K
      </span>
      Klipt
    </Link>
  );
}
