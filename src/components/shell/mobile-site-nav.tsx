"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { NewMenu } from "@/components/shell/new-menu";
import { SiteNav } from "@/components/shell/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { SiteRole } from "@/lib/types";

/** Drawer with the site's sections, for viewports where the sidebar is hidden (below lg). */
export function MobileSiteNav({
  siteId,
  siteName,
  role,
}: {
  siteId: string;
  siteName: string;
  role: SiteRole;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${siteName} sections`}
          className="shrink-0 lg:hidden"
        >
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-5 overflow-y-auto p-4">
        <SheetTitle className="sr-only">{siteName} sections</SheetTitle>
        <SheetDescription className="sr-only">
          Move between sections of {siteName}.
        </SheetDescription>
        <Logo className="px-1 pt-1.5" />
        <p className="truncate px-1 text-sm font-semibold">{siteName}</p>
        <NewMenu siteId={siteId} role={role} className="w-full" />
        <SiteNav siteId={siteId} role={role} onNavigate={close} />
        <div className="border-sidebar-border mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-sidebar-muted-foreground px-1 text-sm">Theme</span>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
