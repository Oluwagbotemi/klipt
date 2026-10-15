"use client";

import { usePathname } from "next/navigation";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { TabNav } from "@/components/shell/tab-nav";
import { PageHeader } from "@/components/page-header";
import { canSeeTab, getSiteNavItem, siteHref, type SiteSection } from "@/lib/navigation";
import type { SiteRole } from "@/lib/types";

/** Breadcrumbs, title and secondary tabs for a site section. */
export function SectionHeader({
  siteId,
  siteName,
  section,
  role,
}: {
  siteId: string;
  siteName: string;
  section: SiteSection;
  role: SiteRole;
}) {
  const pathname = usePathname();
  const item = getSiteNavItem(section)!;
  const sectionHref = siteHref(siteId, section);
  const tabs = item.tabs.filter((tab) => canSeeTab(role, item, tab));

  const segment = pathname.startsWith(`${sectionHref}/`)
    ? pathname.slice(sectionHref.length + 1).split("/")[0]
    : null;
  const activeTab = item.tabs.length > 1 ? item.tabs.find((tab) => tab.segment === segment) : null;

  const crumbs = [
    { label: siteName, href: siteHref(siteId) },
    ...(section === "overview" ? [] : [{ label: item.label, href: sectionHref }]),
    ...(activeTab ? [{ label: activeTab.label }] : []),
  ];

  return (
    <PageHeader
      icon={item.icon}
      title={item.label}
      description={item.description}
      breadcrumbs={crumbs.length > 1 ? <Breadcrumbs items={crumbs} /> : undefined}
      tabs={
        tabs.length > 1 ? (
          <TabNav
            label={`${item.label} pages`}
            items={tabs.map((tab) => ({
              href: siteHref(siteId, section, tab.segment),
              label: tab.label,
              exact: tab.segment === null,
            }))}
          />
        ) : undefined
      }
    />
  );
}
