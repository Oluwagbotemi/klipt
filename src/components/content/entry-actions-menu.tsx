"use client";

import { Archive, ArchiveRestore, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useEntryActions } from "@/components/content/use-entry-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { entryActions, type EntrySummary } from "@/lib/content";
import type { SiteRole } from "@/lib/types";

/** Archive / restore / delete for the entry details page. Hidden when nothing is allowed. */
export function EntryActionsMenu({
  siteId,
  role,
  userId,
  entry,
}: {
  siteId: string;
  role: SiteRole;
  userId: string;
  entry: EntrySummary;
}) {
  const actions = useEntryActions({ siteId, role, userId, redirectToListOnDelete: true });
  const permitted = entryActions(role, userId, entry);
  if (!permitted.archive && !permitted.restore && !permitted.delete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={actions.pending}>
            {actions.pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal aria-hidden />
            )}
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {permitted.archive && (
            <DropdownMenuItem onSelect={() => actions.request("archive", [entry])}>
              <Archive aria-hidden /> Archive
            </DropdownMenuItem>
          )}
          {permitted.restore && (
            <DropdownMenuItem onSelect={() => actions.request("restore", [entry])}>
              <ArchiveRestore aria-hidden /> Restore as draft
            </DropdownMenuItem>
          )}
          {permitted.delete && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => actions.request("delete", [entry])}
            >
              <Trash2 aria-hidden /> Delete permanently
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {actions.dialog}
    </>
  );
}
