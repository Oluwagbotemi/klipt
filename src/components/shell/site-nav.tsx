"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_NAV, siteHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SiteNav({ siteId, onNavigate }: { siteId: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Site" className="flex flex-col gap-5">
      {SITE_NAV.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-0.5">
          {group.label && (
            <h2 className="text-sidebar-muted-foreground px-3 pb-1 text-[0.6875rem] font-medium tracking-wider uppercase">
              {group.label}
            </h2>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = siteHref(siteId, item.section);
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={item.section}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "text-sidebar-muted-foreground flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none",
                      "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent shadow-[0_1px_2px_rgb(0_0_0/0.06)]",
                    )}
                  >
                    <item.icon
                      className={cn("size-4 shrink-0", active && "text-primary")}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
