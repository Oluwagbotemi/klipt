"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { ChevronRight, Globe, LayoutGrid, List, Plus, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SiteAvatar } from "@/components/shell/site-avatar";
import { CreateSiteButton } from "@/components/sites/create-site-dialog";
import { SiteBadges } from "@/components/sites/site-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardArrow } from "@/components/visual/card";
import { TABLE_BODY, TableCard } from "@/components/visual/table-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import type { SiteSummary } from "@/lib/types";

type View = "grid" | "list";

function ownerLabel(site: SiteSummary) {
  return site.currentUserRole === "owner" ? "You" : site.owner.name;
}

export function SitesBrowser({ sites }: { sites: SiteSummary[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const deferredQuery = useDeferredValue(query);

  const needle = deferredQuery.trim().toLowerCase();
  const visible = needle
    ? sites.filter(
        (site) =>
          site.name.toLowerCase().includes(needle) || site.domain?.toLowerCase().includes(needle),
      )
    : sites;

  if (sites.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        scene="structure"
        title="No sites yet"
        description="Create your first site to start adding content. Sites you're invited to will also appear here."
        action={
          <CreateSiteButton>
            <Plus aria-hidden />
            Create site
          </CreateSiteButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <label htmlFor="site-search" className="sr-only">
            Search sites
          </label>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="site-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or domain"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as View)}
          aria-label="Layout"
          className="ml-auto"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length} {visible.length === 1 ? "site" : "sites"}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          scene="search"
          title="No matching sites"
          description={
            <>Nothing matches &ldquo;{deferredQuery.trim()}&rdquo;. Try another name or domain.</>
          }
          action={
            <Button variant="soft" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
          className="py-12 sm:py-16"
        />
      ) : view === "grid" ? (
        <ul data-card-grid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((site) => (
            <li key={site.id} className="min-w-0">
              <SiteCard site={site} />
            </li>
          ))}
        </ul>
      ) : (
        <SiteList sites={visible} />
      )}
    </div>
  );
}

function SiteCard({ site }: { site: SiteSummary }) {
  return (
    <article className="group visual-card visual-lift focus-within:border-ring relative flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <SiteAvatar name={site.name} className="size-11 rounded-xl text-sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">
              <Link
                href={siteHref(site.id)}
                className="outline-none after:absolute after:inset-0 after:rounded-(--radius-card)"
              >
                {site.name}
              </Link>
            </h2>
            <p className="text-muted-foreground truncate text-sm">
              {site.domain ?? "No domain connected"}
            </p>
          </div>
          <CardArrow />
        </div>
        <SiteBadges site={site} />
      </div>
      <dl className="border-card-border text-muted-foreground mt-auto flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 border-t px-5 py-3 text-xs">
        <div className="flex gap-1">
          <dt>Owner:</dt>
          <dd className="text-foreground font-medium">{ownerLabel(site)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Updated:</dt>
          <dd>
            <time dateTime={site.updatedAt}>{formatDate(site.updatedAt)}</time>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function SiteList({ sites }: { sites: SiteSummary[] }) {
  return (
    <TableCard>
      <div
        aria-hidden
        className="bg-card-nested text-muted-foreground border-card-border hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_7rem_1rem] gap-4 border-b px-4 py-2.5 text-xs font-medium md:grid"
      >
        <span>Site</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Updated</span>
        <span />
      </div>
      <ul className={TABLE_BODY}>
        {sites.map((site) => (
          <li
            key={site.id}
            className="group focus-within:bg-card-nested/60 hover:bg-card-nested/60 relative grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_7rem_1rem]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <SiteAvatar name={site.name} />
              <div className="min-w-0">
                <Link
                  href={siteHref(site.id)}
                  className="block truncate text-sm font-semibold outline-none after:absolute after:inset-0 focus-visible:underline"
                >
                  {site.name}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {site.domain ?? "No domain connected"}
                </p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground size-4 md:order-last" aria-hidden />
            <div className="col-span-full md:col-span-1">
              <SiteBadges site={site} />
            </div>
            <p className="hidden truncate text-sm md:block">
              <span className="sr-only">Owner: </span>
              {ownerLabel(site)}
            </p>
            <p className="text-muted-foreground col-span-full text-xs md:col-span-1 md:text-sm">
              <span className="md:sr-only">Updated </span>
              <time dateTime={site.updatedAt}>{formatDate(site.updatedAt)}</time>
            </p>
          </li>
        ))}
      </ul>
    </TableCard>
  );
}
