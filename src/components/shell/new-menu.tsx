"use client";

import { Boxes, FileText, Globe, Loader2, Newspaper, Plus } from "lucide-react";
import { useCreateEntry } from "@/components/content/new-entry-button";
import { useCreateSite } from "@/components/sites/create-site-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionType } from "@/lib/models";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Quick create: a page or post in this site (when the role allows), or a new
 * site. `rail` makes it full-width in the sidebar and icon-only when collapsed.
 */
export function NewMenu({
  siteId,
  role,
  collections = [],
  rail = false,
  className,
}: {
  siteId: string;
  role: SiteRole;
  /** Custom content types, offered after Page and Post. */
  collections?: CollectionType[];
  rail?: boolean;
  className?: string;
}) {
  const canCreateContent = can(role, "content.create");
  const { create, pending } = useCreateEntry(siteId);
  const { openCreateSite } = useCreateSite();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={pending}
          className={cn(rail && "w-full in-data-[sidebar=collapsed]:px-0", className)}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          <span className={rail ? "in-data-[sidebar=collapsed]:sr-only" : undefined}>
            {pending ? "Creating…" : "New"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {canCreateContent && (
          <>
            <DropdownMenuLabel>In this site</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => create("page")}>
              <FileText aria-hidden />
              Page
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create("post")}>
              <Newspaper aria-hidden />
              Post
            </DropdownMenuItem>
            {collections.map((type) => (
              <DropdownMenuItem key={type.key} onSelect={() => create(type.key)}>
                <Boxes aria-hidden />
                <span className="truncate">{type.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => openCreateSite()}>
          <Globe aria-hidden />
          Site
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
