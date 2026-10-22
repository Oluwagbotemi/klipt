"use client";

import { Archive, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkContentAction } from "@/app/(site)/sites/[siteId]/content/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { entryActions, type BulkAction, type EntrySummary } from "@/lib/content";
import type { SiteRole } from "@/lib/types";

const VERB: Record<BulkAction, { label: string; past: string }> = {
  archive: { label: "Archive", past: "Archived" },
  restore: { label: "Restore", past: "Restored to draft" },
  delete: { label: "Delete permanently", past: "Deleted" },
};

const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * Archive / restore / delete for one or many entries. Filters to what the
 * member may do, confirms deletion (and archiving published content), then
 * shows the confirmed server result. The server re-checks every entry.
 */
export function useEntryActions({
  siteId,
  role,
  userId,
  onDone,
  redirectToListOnDelete = false,
}: {
  siteId: string;
  role: SiteRole;
  userId: string;
  onDone?: () => void;
  redirectToListOnDelete?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<{ action: BulkAction; entries: EntrySummary[] } | null>(
    null,
  );

  const allowed = (action: BulkAction, entries: EntrySummary[]) =>
    entries.filter((entry) => entryActions(role, userId, entry)[action]);

  function run(action: BulkAction, entries: EntrySummary[]) {
    startTransition(async () => {
      const result = await bulkContentAction(
        siteId,
        entries.map((e) => e.id),
        action,
        { redirectToList: redirectToListOnDelete },
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const subject =
        entries.length === 1 && result.applied === 1
          ? `“${entries[0].title}”`
          : items(result.applied);
      const skipped = result.skipped
        ? ` ${items(result.skipped)} skipped because they changed or you can't edit them.`
        : "";
      if (result.applied > 0) toast.success(`${VERB[action].past}: ${subject}.${skipped}`);
      else toast.error(`Nothing changed.${skipped}`);
      onDone?.();
    });
  }

  function request(action: BulkAction, entries: EntrySummary[]) {
    const permitted = allowed(action, entries);
    if (permitted.length === 0) return;
    const takesOffline = permitted.some(
      (e) => e.status === "published" || e.status === "scheduled",
    );
    if (action === "delete" || (action === "archive" && takesOffline)) {
      setConfirm({ action, entries: permitted });
    } else {
      run(action, permitted);
    }
  }

  const n = confirm?.entries.length ?? 0;
  const one = n === 1 ? confirm!.entries[0] : null;
  const dialog = (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader
          icon={confirm?.action === "delete" ? Trash2 : Archive}
          tone={confirm?.action === "delete" ? "destructive" : "warning"}
        >
          <AlertDialogTitle>
            {confirm?.action === "delete"
              ? `Delete ${one ? `“${one.title}”` : items(n)} permanently?`
              : `Archive ${one ? `“${one.title}”` : items(n)}?`}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogBody>
          <AlertDialogDescription>
            {confirm?.action === "delete" ? (
              <>
                This removes {one ? "it" : "them"} and {one ? "its" : "their"} revision history. It
                can&apos;t be undone.
              </>
            ) : (
              <>
                Published or scheduled content will no longer be published. You can restore it later
                as a draft.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirm?.action === "delete" ? "destructive" : "default"}
            onClick={() => confirm && run(confirm.action, confirm.entries)}
          >
            {confirm ? VERB[confirm.action].label : ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { request, allowed, pending, dialog };
}
