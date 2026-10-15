"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SiteNav } from "@/components/shell/site-nav";
import { SiteSwitcher } from "@/components/shell/site-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SiteSummary } from "@/lib/types";

/** Drawer navigation for viewports below the desktop breakpoint. */
export function MobileSiteNav({ site, sites }: { site: SiteSummary; sites: SiteSummary[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-5 overflow-y-auto p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Switch sites and move between sections of {site.name}.
        </SheetDescription>
        <Logo className="px-1 pt-1.5" />
        <SiteSwitcher current={site} sites={sites} onNavigate={close} />
        <SiteNav siteId={site.id} onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
