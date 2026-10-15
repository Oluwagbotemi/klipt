"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiteAvatar } from "@/components/shell/site-avatar";
import { siteHref } from "@/lib/navigation";
import type { SiteSummary } from "@/lib/types";

export function SiteSwitcher({
  current,
  sites,
  onNavigate,
}: {
  current: SiteSummary;
  sites: SiteSummary[];
  onNavigate?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="border-sidebar-border bg-sidebar-accent hover:border-input focus-visible:ring-ring/50 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2 text-left outline-none focus-visible:ring-[3px]">
        <SiteAvatar name={current.name} />
        <span className="min-w-0 flex-1">
          <span className="sr-only">Current site: </span>
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="text-sidebar-muted-foreground block truncate text-xs">
            {current.domain ?? "No domain connected"}
          </span>
        </span>
        <ChevronsUpDown className="text-sidebar-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="sr-only">Switch site</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
      >
        <DropdownMenuLabel>Your sites</DropdownMenuLabel>
        <DropdownMenuGroup>
          {sites.map((site) => (
            <DropdownMenuItem key={site.id} asChild>
              <Link href={siteHref(site.id)} onClick={onNavigate}>
                <SiteAvatar name={site.name} className="size-6 text-[0.625rem]" />
                <span className="min-w-0 flex-1 truncate">{site.name}</span>
                {site.id === current.id && (
                  <Check className="text-foreground" aria-label="Current site" />
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/sites" onClick={onNavigate}>
            <LayoutGrid aria-hidden /> All sites
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
