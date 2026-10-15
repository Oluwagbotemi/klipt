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

export interface SiteNavItem {
  section: SiteSection;
  label: string;
  icon: LucideIcon;
  /** One-line summary used in page headers. */
  description: string;
  /** Sub-areas from the information architecture, shown until the section is built. */
  planned: string[];
}

export interface SiteNavGroup {
  label: string | null;
  items: SiteNavItem[];
}

/** Persistent site sidebar, per references/information-architecture.md §3. */
export const SITE_NAV: SiteNavGroup[] = [
  {
    label: null,
    items: [
      {
        section: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        description: "Recent content, SEO health, and what needs attention.",
        planned: [
          "Site summary",
          "Recent content and activity",
          "SEO health summary",
          "Quick actions",
        ],
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
        planned: ["All content", "Pages", "Posts", "Collections", "Content editor"],
      },
      {
        section: "media",
        label: "Media",
        icon: ImageIcon,
        description: "Images and files, with alt text and usage.",
        planned: ["Media library", "Upload", "Media details and alt text"],
      },
    ],
  },
  {
    label: "Structure",
    items: [
      {
        section: "models",
        label: "Content Models",
        icon: Boxes,
        description: "Define the structure of your content types.",
        planned: ["Models", "Fields and validation", "Relationships", "Schema mapping"],
      },
      {
        section: "navigation",
        label: "Navigation",
        icon: ListTree,
        description: "Header, footer, and custom menus.",
        planned: ["Menus", "Menu editor"],
      },
      {
        section: "taxonomy",
        label: "Taxonomy",
        icon: Tags,
        description: "Categories, tags, and custom taxonomies.",
        planned: ["Categories", "Tags", "Custom taxonomies"],
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
        planned: [
          "Overview and issues",
          "Internal links",
          "Redirects",
          "Sitemap",
          "Crawling and indexing",
        ],
      },
      {
        section: "performance",
        label: "Performance",
        icon: Gauge,
        description: "Core Web Vitals and recommendations from connected data sources.",
        planned: ["Overview", "Core Web Vitals", "Page and asset performance", "Recommendations"],
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
        planned: ["Members and invitations", "Roles and permissions", "Activity"],
      },
      {
        section: "settings",
        label: "Settings",
        icon: Settings,
        description: "Domains, publishing, SEO defaults, and ownership.",
        planned: [
          "General",
          "Domains",
          "Publishing",
          "SEO defaults",
          "Integrations",
          "Ownership",
          "Danger zone",
        ],
      },
    ],
  },
];

export const SITE_NAV_ITEMS: SiteNavItem[] = SITE_NAV.flatMap((group) => group.items);

export function getSiteNavItem(section: string): SiteNavItem | undefined {
  return SITE_NAV_ITEMS.find((item) => item.section === section);
}

export function siteHref(siteId: string, section: SiteSection = "overview") {
  return `/sites/${siteId}/${section}`;
}
