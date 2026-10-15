"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NewMenu } from "@/components/shell/new-menu";
import { SiteNav } from "@/components/shell/site-nav";
import { Button } from "@/components/ui/button";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/lib/sidebar-state";
import type { SiteRole } from "@/lib/types";

const asideClasses =
  "sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-4 overflow-y-auto px-3 pt-2 pb-3 transition-[width] duration-200 lg:flex in-data-[sidebar=collapsed]:w-[4.25rem]";

/** Section navigation for the current site (lg+). Collapses to an icon rail. */
export function SiteSidebar({ siteId, role }: { siteId: string; role: SiteRole }) {
  const collapsed = useSidebarCollapsed();

  return (
    <aside className={asideClasses} aria-label="Sidebar">
      <NewMenu role={role} rail />
      <div className="flex-1">
        <SiteNav siteId={siteId} role={role} rail showTooltips={collapsed} />
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSidebarCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="text-sidebar-muted-foreground justify-start in-data-[sidebar=collapsed]:justify-center in-data-[sidebar=collapsed]:px-0"
      >
        {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        <span className="in-data-[sidebar=collapsed]:sr-only">
          {collapsed ? "Expand sidebar" : "Collapse sidebar"}
        </span>
      </Button>
    </aside>
  );
}

export function SiteSidebarPlaceholder() {
  return <div className={asideClasses} aria-hidden />;
}
