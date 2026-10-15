"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { siteHref, visibleSiteNav } from "@/lib/navigation";
import type { SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Section list for the sidebar and the mobile drawer. With `rail`, labels and
 * group headings become screen-reader-only while the sidebar is collapsed
 * (CSS keyed on data-sidebar on <html>), and `showTooltips` adds hover labels.
 */
export function SiteNav({
  siteId,
  role,
  rail = false,
  showTooltips = false,
  onNavigate,
}: {
  siteId: string;
  role: SiteRole;
  rail?: boolean;
  showTooltips?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hideInRail = rail ? "in-data-[sidebar=collapsed]:sr-only" : undefined;

  return (
    <nav aria-label="Site sections" className="flex flex-col gap-5">
      {visibleSiteNav(role).map((group, index) => (
        <div
          key={group.label ?? index}
          className={cn(
            "flex flex-col gap-0.5",
            rail &&
              index > 0 &&
              "in-data-[sidebar=collapsed]:border-sidebar-border in-data-[sidebar=collapsed]:border-t in-data-[sidebar=collapsed]:pt-3",
          )}
        >
          {group.label && (
            <h2
              className={cn(
                "text-sidebar-muted-foreground px-3 pb-1 text-[0.6875rem] font-medium tracking-wider uppercase",
                hideInRail,
              )}
            >
              {group.label}
            </h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = siteHref(siteId, item.section);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const link = (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-sidebar-muted-foreground flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none",
                    "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    rail &&
                      "in-data-[sidebar=collapsed]:justify-center in-data-[sidebar=collapsed]:px-0",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent shadow-[0_1px_2px_rgb(0_0_0/0.06)]",
                  )}
                >
                  <item.icon
                    className={cn("size-4 shrink-0", active && "text-primary")}
                    aria-hidden
                  />
                  <span className={hideInRail}>{item.label}</span>
                </Link>
              );
              return (
                <li key={item.section}>
                  {showTooltips ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
