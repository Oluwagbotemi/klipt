"use client";

import { useTransition } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { restoreSiteAction } from "@/app/(account)/sites/actions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

/** Archived sites the user owns, with Restore. */
export function ArchivedSites({
  sites,
}: {
  sites: { id: string; name: string; domain: string | null; archivedAt: string }[];
}) {
  const [pending, startTransition] = useTransition();
  if (sites.length === 0) return null;
  return (
    <section aria-labelledby="archived-heading" className="visual-card mt-4 overflow-hidden">
      <div className="p-5 pb-3 sm:px-6">
        <h2 id="archived-heading" className="text-base font-semibold">
          Archived sites
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Only you can see these. Restore one to give its team access again and turn its API keys
          back on.
        </p>
      </div>
      <ul className="border-card-border divide-card-border divide-y border-t">
        {sites.map((site) => (
          <li
            key={site.id}
            className="hover:bg-card-nested/60 flex flex-wrap items-center gap-3 px-5 py-3 transition-colors sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{site.name}</p>
              <p className="text-muted-foreground text-xs">
                {site.domain ? `${site.domain} · ` : ""}Archived {formatDate(site.archivedAt)}
              </p>
            </div>
            <Button
              variant="soft"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await restoreSiteAction(site.id);
                  if (result.ok) toast.success(`Restored ${site.name}.`);
                  else toast.error(result.error);
                })
              }
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ArchiveRestore aria-hidden />
              )}
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
