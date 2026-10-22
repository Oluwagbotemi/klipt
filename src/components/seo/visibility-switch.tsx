"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { setSearchVisibilityAction } from "@/app/(site)/sites/[siteId]/seo/actions";
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
import { Switch } from "@/components/ui/switch";

/** Site-wide search visibility, confirmed either way because it affects every page. */
export function VisibilitySwitch({
  siteId,
  allowIndexing,
  canManage,
}: {
  siteId: string;
  allowIndexing: boolean;
  canManage: boolean;
}) {
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(event: React.MouseEvent) {
    event.preventDefault();
    if (confirming === null) return;
    const next = confirming;
    startTransition(async () => {
      const result = await setSearchVisibilityAction(siteId, next);
      if (result.ok) {
        toast.success(
          next
            ? "Search engines may index the site."
            : "The site is now hidden from search engines.",
        );
        setConfirming(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <label className="flex items-start gap-3">
        <Switch
          checked={allowIndexing}
          onCheckedChange={(checked) => setConfirming(checked)}
          disabled={!canManage || pending}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium">
            {allowIndexing ? "Search engines may index this site" : "Hidden from search engines"}
          </span>
          <span className="text-muted-foreground block text-sm">
            {allowIndexing
              ? "Each page follows its own indexing setting."
              : "Every page is sent as noindex, nofollow and the sitemap is empty."}
          </span>
        </span>
      </label>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && !pending && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader icon={Search} tone={confirming ? "primary" : "destructive"}>
            <AlertDialogTitle>
              {confirming
                ? "Let search engines index this site?"
                : "Hide the whole site from search engines?"}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              {confirming
                ? "Pages set to index can appear in search results again, and the sitemap lists them. It can take search engines days or weeks to notice."
                : "Use this for a staging or unfinished site. Every page tells search engines not to index it and the sitemap becomes empty. Pages already in search results will drop out over time, and getting them back can take weeks."}
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming ? "default" : "destructive"}
              onClick={apply}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirming ? "Allow indexing" : "Hide from search engines"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
