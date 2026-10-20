"use client";

import { useTransition } from "react";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { previewLinkAction } from "@/app/(site)/sites/[siteId]/content/preview-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Opens a preview in a new tab: on the site's own website when a preview
 * address is set (a fresh, signed link each time), otherwise inside Klipt.
 */
export function PreviewButton({
  siteId,
  entryId,
  previewHost,
}: {
  siteId: string;
  entryId: string;
  /** Host of the website's preview address, or null when none is set. */
  previewHost: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const builtIn = `/preview/${siteId}/${entryId}`;

  if (!previewHost) {
    return (
      <Button variant="outline" asChild>
        <a href={builtIn} target="_blank" rel="noopener">
          Preview
          <ExternalLink aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    );
  }

  function openOnWebsite() {
    // Open the tab now (inside the click) so pop-up blockers allow it, then point it at the link.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await previewLinkAction(siteId, entryId);
      if (!result.ok || !result.url) {
        tab?.close();
        toast.error(result.ok ? "No preview address is set for this site." : result.error);
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = result.url;
      } else {
        window.location.href = result.url;
      }
    });
  }

  return (
    <div className="flex">
      <Button
        variant="outline"
        className="rounded-r-none"
        onClick={openOnWebsite}
        disabled={pending}
        title={`Opens the draft on ${previewHost}`}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ExternalLink aria-hidden />}
        Preview on website
        <span className="sr-only">(opens {previewHost} in a new tab)</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="-ml-px rounded-l-none"
            aria-label="More preview options"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={openOnWebsite}>
            <span className="flex flex-col">
              <span>On your website</span>
              <span className="text-muted-foreground text-xs">{previewHost}, your real design</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={builtIn} target="_blank" rel="noopener">
              <span className="flex flex-col">
                <span>In Klipt</span>
                <span className="text-muted-foreground text-xs">A plain view of the content</span>
              </span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
