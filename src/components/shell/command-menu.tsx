"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CornerDownLeft, FileText, Globe, LayoutGrid, Newspaper, Plus, Search } from "lucide-react";
import { useCreateEntry } from "@/components/content/new-entry-button";
import { useCreateSite } from "@/components/sites/create-site-dialog";
import { Button } from "@/components/ui/button";
import { canSeeTab, siteHref, visibleSiteNav } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CommandMenuSite {
  id: string;
  name: string;
  domain: string | null;
}

const noopSubscribe = () => () => {};
const getShortcutLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

/**
 * Quick navigation: ⌘K / Ctrl+K opens a searchable list of pages in the
 * current site (only those the member's role allows), other sites, and actions.
 */
export function CommandMenu({
  sites,
  current,
}: {
  sites: CommandMenuSite[];
  current?: { siteId: string; siteName: string; role: SiteRole };
}) {
  const router = useRouter();
  const { openCreateSite } = useCreateSite();
  const [open, setOpen] = useState(false);
  const shortcut = useSyncExternalStore(noopSubscribe, getShortcutLabel, () => "Ctrl K");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { create } = useCreateEntry(current?.siteId ?? "");
  const canCreateContent = current ? can(current.role, "content.create") : false;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const pages = current
    ? visibleSiteNav(current.role).flatMap((group) =>
        group.items.flatMap((item) =>
          item.tabs
            .filter((tab) => canSeeTab(current.role, item, tab))
            .map((tab) => ({
              key: `${item.section}/${tab.segment ?? ""}`,
              icon: item.icon,
              label: tab.segment ? `${item.label} › ${tab.label}` : item.label,
              href: siteHref(current.siteId, item.section, tab.segment),
            })),
        ),
      )
    : [];

  const itemClass =
    "flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
  const groupClass =
    "[&_[cmdk-group-heading]]:text-muted-foreground px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Search and jump to"
        aria-keyshortcuts="Meta+K Control+K"
        className="text-muted-foreground bg-background hover:text-foreground w-9 justify-center px-0 sm:w-56 sm:justify-start sm:px-3"
      >
        <Search aria-hidden />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="bg-muted ml-auto hidden rounded px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium sm:inline">
          {shortcut}
        </kbd>
      </Button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search and jump to"
        overlayClassName="modal-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        contentClassName={cn(
          "bg-popover text-popover-foreground fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        )}
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <Command.Input
            placeholder={
              current ? `Search ${current.siteName} and your sites…` : "Search your sites…"
            }
            aria-label="Search"
            className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto py-2">
          <Command.Empty className="text-muted-foreground px-4 py-8 text-center text-sm">
            No matching pages or sites.
          </Command.Empty>

          {pages.length > 0 && (
            <Command.Group heading={current!.siteName} className={groupClass}>
              {pages.map((page) => (
                <Command.Item
                  key={page.key}
                  value={page.label}
                  onSelect={() => go(page.href)}
                  className={itemClass}
                >
                  <page.icon aria-hidden />
                  {page.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Sites" className={groupClass}>
            {sites
              .filter((site) => site.id !== current?.siteId)
              .map((site) => (
                <Command.Item
                  key={site.id}
                  value={`site ${site.name} ${site.domain ?? ""}`}
                  onSelect={() => go(siteHref(site.id))}
                  className={itemClass}
                >
                  <Globe aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{site.name}</span>
                  {site.domain && (
                    <span className="text-muted-foreground truncate text-xs">{site.domain}</span>
                  )}
                </Command.Item>
              ))}
            <Command.Item value="All sites" onSelect={() => go("/sites")} className={itemClass}>
              <LayoutGrid aria-hidden />
              All sites
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Actions" className={groupClass}>
            {canCreateContent && (
              <>
                <Command.Item
                  value="New page create"
                  onSelect={() => {
                    setOpen(false);
                    create("page");
                  }}
                  className={itemClass}
                >
                  <FileText aria-hidden />
                  New page
                </Command.Item>
                <Command.Item
                  value="New post create"
                  onSelect={() => {
                    setOpen(false);
                    create("post");
                  }}
                  className={itemClass}
                >
                  <Newspaper aria-hidden />
                  New post
                </Command.Item>
              </>
            )}
            <Command.Item
              value="Create site new"
              onSelect={() => {
                setOpen(false);
                openCreateSite();
              }}
              className={itemClass}
            >
              <Plus aria-hidden />
              Create site
            </Command.Item>
          </Command.Group>
        </Command.List>
        <div className="text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-xs">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="size-3" aria-hidden /> to open
          </span>
          <span>↑↓ to move</span>
          <span>Esc to close</span>
        </div>
      </Command.Dialog>
    </>
  );
}
