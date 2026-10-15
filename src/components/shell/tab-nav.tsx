"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOverflowFade } from "@/hooks/use-overflow-fade";
import { cn } from "@/lib/utils";

export interface TabNavItem {
  href: string;
  label: string;
  /** Match only this exact path (index tabs); otherwise nested paths count as active. */
  exact?: boolean;
}

/**
 * Horizontal link tabs. When they don't fit, the row scrolls sideways and
 * fades at the edge that has more tabs, and the active tab is scrolled into view.
 */
export function TabNav({
  items,
  label,
  className,
}: {
  items: TabNavItem[];
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const fade = useOverflowFade(listRef);

  const isActive = (item: TabNavItem) =>
    pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[aria-current=page]");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul
        ref={listRef}
        onScroll={fade.onScroll}
        style={fade.style}
        className="flex [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 relative flex h-11 items-center px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-inset",
                  active &&
                    "text-foreground after:bg-primary font-medium after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
