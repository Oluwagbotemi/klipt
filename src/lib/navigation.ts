import {
  Boxes,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  ListTree,
  Search,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { can, type SitePermission } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Site navigation model: top-level sections (top bar) and their tabs
 * (secondary navigation under the page title). Follows the information
 * architecture in .claude/skills/cms-interface-design/references.
 *
 * `permission` hides an entry from members who lack it. It is display-only;
 * pages still authorize on the server.
 */

export type SiteSection =
  | "overview"
  | "content"
  | "media"
  | "models"
  | "navigation"
  | "taxonomy"
  | "seo"
  | "performance"
  | "team"
  | "settings";

export interface SiteTab {
  /** URL segment after the section; null for the section's index tab. */
  segment: string | null;
  label: string;
  permission?: SitePermission;
  /** What this page will contain, shown until it is built. */
  planned: string[];
}

export interface SiteNavItem {
  section: SiteSection;
  label: string;
  icon: LucideIcon;
  /** One-line summary used in page headers. */
  description: string;
  permission?: SitePermission;
  /** Secondary navigation. A single tab means the section has no tab row. */
  tabs: SiteTab[];
}

export interface SiteNavGroup {
  label: string | null;
  items: SiteNavItem[];
}

const single = (planned: string[]): SiteTab[] => [{ segment: null, label: "", planned }];

export const SITE_NAV: SiteNavGroup[] = [
  {
    label: null,
    items: [
      {
        section: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        description: "Recent content, SEO health, and what needs attention.",
        tabs: single([
          "Site summary",
          "Recent content and activity",
          "SEO health summary",
          "Quick actions",
        ]),
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        section: "content",
        label: "Content",
        icon: FileText,
        description: "Pages, posts, and collections for this site.",
        tabs: [
          {
            segment: null,
            label: "All content",
            planned: ["Search and filters", "Status: draft to published", "Bulk actions"],
          },
          { segment: "pages", label: "Pages", planned: ["Standalone pages", "Page hierarchy"] },
          {
            segment: "posts",
            label: "Posts",
            planned: ["Dated articles", "Authors and categories"],
          },
          {
            segment: "collections",
            label: "Collections",
            planned: ["Entries of custom content models"],
          },
        ],
      },
      {
        section: "media",
        label: "Media",
        icon: ImageIcon,
        description: "Images and files, with alt text and usage.",
        tabs: [
          {
            segment: null,
            label: "All media",
            planned: ["Grid and list views", "Upload", "Missing alt text warnings"],
          },
          { segment: "images", label: "Images", planned: ["Alt text and captions", "Dimensions"] },
          { segment: "files", label: "Files", planned: ["Documents and downloads", "Usage"] },
        ],
      },
    ],
  },
  {
    label: "Structure",
    items: [
      {
        section: "models",
        label: "Content models",
        icon: Boxes,
        description: "Define the structure of your content types.",
        tabs: single(["Models", "Fields and validation", "Relationships", "Schema mapping"]),
      },
      {
        section: "navigation",
        label: "Navigation",
        icon: ListTree,
        description: "Header, footer, and custom menus for your published site.",
        tabs: single(["Header and footer menus", "Custom menus", "Menu editor"]),
      },
      {
        section: "taxonomy",
        label: "Taxonomy",
        icon: Tags,
        description: "Categories, tags, and custom taxonomies.",
        tabs: [
          { segment: null, label: "Categories", planned: ["Nested categories", "Category URLs"] },
          { segment: "tags", label: "Tags", planned: ["Tags and tag pages"] },
          {
            segment: "custom",
            label: "Custom taxonomies",
            planned: ["Your own groupings, e.g. Region or Topic"],
          },
        ],
      },
    ],
  },
  {
    label: "Optimize",
    items: [
      {
        section: "seo",
        label: "SEO",
        icon: Search,
        description: "Metadata issues, redirects, sitemap, and indexing.",
        tabs: [
          {
            segment: null,
            label: "Overview",
            planned: ["SEO health", "Issues", "Recommendations"],
          },
          {
            segment: "pages",
            label: "Pages",
            planned: [
              "Missing metadata",
              "Missing alt text",
              "Duplicate metadata",
              "Indexing status",
            ],
          },
          {
            segment: "links",
            label: "Internal links",
            planned: ["Broken links", "Orphaned pages", "Link opportunities"],
          },
          {
            segment: "redirects",
            label: "Redirects",
            permission: "seo.manage",
            planned: ["All redirects", "Create redirect", "Loop detection"],
          },
          {
            segment: "sitemap",
            label: "Sitemap",
            planned: ["Sitemap overview", "Inclusion rules"],
          },
          {
            segment: "indexing",
            label: "Crawling & indexing",
            permission: "seo.manage",
            planned: ["Search visibility", "Robots", "Indexing rules"],
          },
        ],
      },
      {
        section: "performance",
        label: "Performance",
        icon: Gauge,
        description: "Core Web Vitals and recommendations from connected data sources.",
        tabs: [
          {
            segment: null,
            label: "Overview",
            planned: ["Summary with data source and time window"],
          },
          {
            segment: "web-vitals",
            label: "Core Web Vitals",
            planned: ["LCP", "INP", "CLS", "Field vs. lab data, clearly labelled"],
          },
          { segment: "pages", label: "Pages", planned: ["Per-page performance"] },
          { segment: "assets", label: "Assets", planned: ["Large images and scripts"] },
          {
            segment: "recommendations",
            label: "Recommendations",
            planned: ["Actionable fixes"],
          },
        ],
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        section: "team",
        label: "Team",
        icon: Users,
        description: "Members, roles, and activity.",
        tabs: [
          {
            segment: null,
            label: "Members",
            planned: ["Members and invitations", "Invite member"],
          },
          {
            segment: "roles",
            label: "Roles & permissions",
            planned: ["What each role can do"],
          },
          {
            segment: "assignments",
            label: "Assignments",
            planned: ["Who is working on what"],
          },
          {
            segment: "activity",
            label: "Activity",
            permission: "members.manage",
            planned: ["Audit log of changes on this site"],
          },
        ],
      },
      {
        section: "settings",
        label: "Settings",
        icon: Settings,
        description: "Domains, publishing, SEO defaults, and ownership.",
        permission: "site.update",
        tabs: [
          {
            segment: null,
            label: "General",
            planned: ["Site name and URL", "Language and timezone", "Logo and favicon"],
          },
          {
            segment: "domains",
            label: "Domains",
            planned: ["Domain list", "Add domain", "DNS configuration"],
          },
          {
            segment: "publishing",
            label: "Publishing",
            planned: ["Publishing defaults", "Environments"],
          },
          {
            segment: "seo",
            label: "SEO defaults",
            planned: ["Default metadata", "Social defaults", "Schema defaults"],
          },
          {
            segment: "integrations",
            label: "Integrations",
            permission: "api_keys.manage",
            planned: ["Connected apps", "API keys", "Webhooks"],
          },
          {
            segment: "billing",
            label: "Billing & plan",
            permission: "billing.manage",
            planned: ["Plan", "Invoices", "Payment method"],
          },
          {
            segment: "ownership",
            label: "Ownership",
            permission: "site.transfer_ownership",
            planned: [
              "Current owner",
              "Transfer ownership",
              "Pending transfer",
              "Transfer history",
            ],
          },
          {
            segment: "danger",
            label: "Danger zone",
            permission: "site.delete",
            planned: ["Archive site", "Delete site"],
          },
        ],
      },
    ],
  },
];

export const SITE_NAV_ITEMS: SiteNavItem[] = SITE_NAV.flatMap((group) => group.items);

export function getSiteNavItem(section: string): SiteNavItem | undefined {
  return SITE_NAV_ITEMS.find((item) => item.section === section);
}

export function getSiteTab(item: SiteNavItem, segment: string | null): SiteTab | undefined {
  return item.tabs.find((tab) => tab.segment === segment);
}

export function siteHref(
  siteId: string,
  section: SiteSection = "overview",
  segment: string | null = null,
) {
  return `/sites/${siteId}/${section}${segment ? `/${segment}` : ""}`;
}

export function canSeeSection(role: SiteRole, item: SiteNavItem): boolean {
  return !item.permission || can(role, item.permission);
}

export function canSeeTab(role: SiteRole, item: SiteNavItem, tab: SiteTab): boolean {
  return canSeeSection(role, item) && (!tab.permission || can(role, tab.permission));
}

/** Sections visible to a role, keeping their groups (empty groups removed). */
export function visibleSiteNav(role: SiteRole): SiteNavGroup[] {
  return SITE_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeSection(role, item)),
  })).filter((group) => group.items.length > 0);
}
