"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { House, LayoutGrid, Plus, X } from "lucide-react";
import { SiteAvatar } from "@/components/shell/site-avatar";
import { useCreateSite } from "@/components/sites/create-site-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOverflowFade } from "@/hooks/use-overflow-fade";
import { siteHref } from "@/lib/navigation";
import { closeOpenSite, rememberOpenSite, useOpenSites } from "@/lib/open-sites";
import { cn } from "@/lib/utils";

export interface BarSite {
  id: string;
  name: string;
  domain: string | null;
}

const SITE_PATH = /^\/sites\/([^/]+)\/.+/;

/**
 * Top bar: a Home button, one tab per opened site (each remembers the last
 * page visited), and + to open another site. `children` render on the right.
 */
export function OpenSitesBar({
  userId,
  sites,
  leading,
  children,
}: {
  userId: string;
  sites: BarSite[];
  /** Rendered before the Home button (e.g. the mobile menu trigger). */
  leading?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openCreateSite } = useCreateSite();
  const stored = useOpenSites(userId);
  const listRef = useRef<HTMLUListElement>(null);
  const fade = useOverflowFade(listRef);

  const byId = new Map(sites.map((site) => [site.id, site]));
  const match = SITE_PATH.exec(pathname);
  const activeId = match && byId.has(match[1]) ? match[1] : null;

  // Opening a site (or moving within it) records it as a tab.
  useEffect(() => {
    if (activeId) rememberOpenSite(userId, activeId, pathname);
  }, [userId, activeId, pathname]);

  // Only sites the member can still access; the active site always shows.
  const tabs = stored.filter((tab) => byId.has(tab.id));
  if (activeId && !tabs.some((tab) => tab.id === activeId)) {
    tabs.push({ id: activeId, path: pathname });
  }
  const openIds = new Set(tabs.map((tab) => tab.id));
  const closedSites = sites.filter((site) => !openIds.has(site.id));

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[aria-current=page]");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  function close(id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    closeOpenSite(userId, id);
    if (id !== activeId) return;
    const neighbour = tabs[index + 1] ?? tabs[index - 1];
    router.push(neighbour && neighbour.id !== id ? neighbour.path : "/sites");
  }

  return (
    <div className="flex h-14 items-center gap-1 px-2 sm:gap-1.5 sm:px-3">
      {leading}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            asChild
            className={cn(pathname === "/sites" && "bg-background border shadow-sm")}
          >
            <Link
              href="/sites"
              aria-label="All sites"
              aria-current={pathname === "/sites" ? "page" : undefined}
            >
              <House aria-hidden />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>All sites</TooltipContent>
      </Tooltip>

      {tabs.length > 0 && (
        <nav aria-label="Open sites" className="min-w-0 shrink">
          <ul
            ref={listRef}
            onScroll={fade.onScroll}
            style={fade.style}
            className="flex [scrollbar-width:none] items-center gap-1 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab) => {
              const site = byId.get(tab.id)!;
              const active = tab.id === activeId;
              return (
                <li
                  key={tab.id}
                  className={cn(
                    "group/tab flex h-9 shrink-0 items-center rounded-lg border border-transparent transition-colors",
                    active
                      ? "bg-background border-border shadow-sm"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Link
                    href={active ? siteHref(tab.id) : tab.path}
                    aria-current={active ? "page" : undefined}
                    title={site.domain ?? site.name}
                    className="focus-visible:ring-ring/50 flex h-full items-center gap-2 rounded-lg pr-1 pl-2 text-sm outline-none focus-visible:ring-[3px]"
                  >
                    <SiteAvatar name={site.name} className="size-5 rounded text-[0.5625rem]" />
                    <span className={cn("max-w-40 truncate", active && "font-medium")}>
                      {site.name}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => close(tab.id)}
                    aria-label={`Close ${site.name}`}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 mr-1 grid size-6 cursor-pointer place-items-center rounded-md outline-none focus-visible:ring-[3px]"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open a site" className="shrink-0">
                <Plus aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Open a site</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-72">
          {closedSites.length > 0 ? (
            <>
              <DropdownMenuLabel>Open a site</DropdownMenuLabel>
              <DropdownMenuGroup>
                {closedSites.map((site) => (
                  <DropdownMenuItem key={site.id} asChild>
                    <Link href={siteHref(site.id)}>
                      <SiteAvatar name={site.name} className="size-7 rounded-md text-[0.625rem]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{site.name}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {site.domain ?? "No domain connected"}
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : (
            <DropdownMenuLabel className="font-normal">
              {sites.length > 0
                ? "All your sites are already open."
                : "You don't have any sites yet."}
            </DropdownMenuLabel>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/sites">
              <LayoutGrid aria-hidden /> All sites
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openCreateSite()}>
            <Plus aria-hidden /> Create site
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">{children}</div>
    </div>
  );
}
