"use client";

import Link from "next/link";
import { FileText, Globe, Newspaper, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Quick create. Page and post creation arrive with the content editor; until
 * then they are shown disabled and labelled, so nothing pretends to work.
 * `rail` makes it full-width in the sidebar and icon-only when collapsed.
 */
export function NewMenu({
  role,
  rail = false,
  className,
}: {
  role: SiteRole;
  rail?: boolean;
  className?: string;
}) {
  const canCreateContent = can(role, "content.create");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn(rail && "w-full in-data-[sidebar=collapsed]:px-0", className)}>
          <Plus aria-hidden />
          <span className={rail ? "in-data-[sidebar=collapsed]:sr-only" : undefined}>New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {canCreateContent && (
          <>
            <DropdownMenuLabel>In this site</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              <FileText aria-hidden />
              Page
              <span className="text-muted-foreground ml-auto text-xs">Not built yet</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Newspaper aria-hidden />
              Post
              <span className="text-muted-foreground ml-auto text-xs">Not built yet</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/sites/new">
            <Globe aria-hidden />
            Site
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
