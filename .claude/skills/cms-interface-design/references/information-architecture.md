# SEO-Friendly CMS — Information Architecture & Sitemap

## Product Overview

A web-based, mobile-responsive content management system focused on fast-loading pages, clean code output, structured content, and direct control over SEO settings. The architecture supports individual site owners, teams, and agencies that build sites for clients and later transfer ownership.

## 1. Product Hierarchy

```text
Account
├── Sites / Projects
│   ├── All Sites
│   ├── Create New Site
│   └── Selected Site
│       └── Site CMS (see section 2)
├── Account Settings
│   ├── Profile
│   ├── Security
│   └── Notifications
└── Agency Workspace (future)
    ├── Sites
    ├── Clients
    ├── Team
    └── Billing
```

**Architecture principle:** A site is owned independently of the user's account. Transferring a site does not transfer the entire account.

## 2. Site CMS — Full Sitemap

```text
Selected Site
├── 01. Overview
│   ├── Site Overview
│   ├── SEO Health
│   ├── Performance Summary
│   ├── Content Activity
│   ├── Recent Content
│   └── Quick Actions
│
├── 02. Content
│   ├── All Content
│   │   ├── Pages
│   │   ├── Posts / Articles
│   │   ├── Drafts
│   │   ├── Scheduled
│   │   ├── Published
│   │   └── Archived
│   ├── Content Editor
│   │   ├── Content
│   │   ├── URL / Slug
│   │   ├── SEO Metadata
│   │   ├── Social Preview
│   │   ├── Schema
│   │   ├── Preview
│   │   └── Publishing
│   └── Collections
│       ├── View Collection
│       ├── Create Collection
│       └── Collection Items
│
├── 03. Media
│   ├── Media Library
│   ├── Images
│   ├── Files
│   ├── Upload Media
│   └── Media Details
│       ├── Preview
│       ├── Alt Text
│       ├── Caption
│       ├── File Information
│       └── Usage
│
├── 04. Content Models
│   ├── All Models
│   ├── Create Model
│   └── Model Editor
│       ├── Fields
│       ├── Validation
│       ├── Relationships
│       ├── Components
│       └── Schema Mapping
│
├── 05. Navigation
│   ├── Menus
│   ├── Header Navigation
│   ├── Footer Navigation
│   └── Menu Editor
│
├── 06. Taxonomy
│   ├── Categories
│   ├── Tags
│   └── Custom Taxonomies
│
├── 07. SEO
│   ├── Overview
│   │   ├── SEO Health
│   │   ├── Issues
│   │   └── Recommendations
│   ├── Pages
│   │   ├── Missing Metadata
│   │   ├── Missing Alt Text
│   │   ├── Duplicate Metadata
│   │   └── Indexing Status
│   ├── Internal Links
│   │   ├── Broken Links
│   │   ├── Orphaned Pages
│   │   └── Link Opportunities
│   ├── Redirects
│   │   ├── All Redirects
│   │   └── Create Redirect
│   ├── Sitemap
│   │   ├── Sitemap Overview
│   │   └── Sitemap Configuration
│   └── Crawling & Indexing
│       ├── Search Visibility
│       ├── Robots
│       └── Indexing Rules
│
├── 08. Performance
│   ├── Overview
│   ├── Core Web Vitals
│   │   ├── LCP
│   │   ├── INP
│   │   └── CLS
│   ├── Page Performance
│   ├── Asset Performance
│   └── Recommendations
│
├── 09. Team
│   ├── Members
│   ├── Invite Member
│   ├── Roles & Permissions
│   ├── Content Assignments
│   └── Activity
│
└── 10. Settings
    ├── General
    │   ├── Site Name
    │   ├── Site URL
    │   ├── Language
    │   ├── Timezone
    │   ├── Logo
    │   └── Favicon
    ├── Domains
    │   ├── Domain List
    │   ├── Add Domain
    │   └── Domain Configuration
    ├── Publishing
    │   ├── Publishing Defaults
    │   └── Environments
    ├── SEO Defaults
    │   ├── Default Metadata
    │   ├── Social Defaults
    │   └── Schema Defaults
    ├── Integrations
    │   ├── Connected Apps
    │   ├── API
    │   ├── API Keys
    │   └── Webhooks
    ├── Billing & Plan
    ├── Ownership
    │   ├── Current Owner
    │   ├── Transfer Ownership
    │   ├── Pending Transfer
    │   └── Transfer History
    └── Danger Zone
        ├── Archive Site
        └── Delete Site
```

## 3. Recommended Primary Sidebar

The full sitemap is not the same as the visible navigation. Use a compact sidebar with deeper features inside each section.

```text
[Site Name ▾]

Overview

CONTENT
  Content
  Media

STRUCTURE
  Content Models
  Navigation
  Taxonomy

OPTIMIZE
  SEO
  Performance

MANAGE
  Team
  Settings
```

### Secondary Navigation Examples

**Content:** All Content · Pages · Posts · Collections

**SEO:** Overview · Pages · Internal Links · Redirects · Sitemap · Crawling & Indexing

**Settings:** General · Domains · Publishing · SEO Defaults · Integrations · Billing & Plan · Ownership · Danger Zone

Content statuses (Draft, In Review, Scheduled, Published, Archived) can be filters rather than separate permanent navigation pages.

## 4. Core User Journey

```text
Select Site
    ↓
Content → Create New
    ↓
Choose Content Type
    ↓
Add / Edit Content
    ↓
Configure URL and SEO
    ↓
Preview
    ↓
Publish or Schedule
    ↓
Monitor SEO and Performance
```

The editor should offer everyday controls first (title, description, slug, alt text), with advanced controls (canonical URL, indexing, schema) available when needed.

## 5. Ownership Transfer — Agency to Client

**Location:** Settings → Ownership → Transfer Ownership

```text
Agency Creates Site
    ↓
Builds and Configures Site
    ↓
Invites Client or Selects Existing Member
    ↓
Initiates Ownership Transfer
    ↓
Security Confirmation
    ↓
Client Receives Invitation
    ↓
Client Accepts
    ↓
Client Becomes Site Owner
    ↓
Agency Remains Admin or Leaves Site
```

### Required States and Safeguards

- One primary owner per site.
- Transfer to an existing user or invite a new user.
- Recipient acceptance is required before ownership changes.
- Pending transfers can be cancelled before acceptance.
- Re-authentication or equivalent security confirmation for transfer initiation.
- Transfer history and notifications.
- Explicit handling of agency access after transfer.
- Billing, domain, and third-party integration responsibilities must be reviewed separately; site ownership does not automatically transfer external accounts or domain registrations.

## 6. Responsive Design Considerations

- **Desktop:** Persistent sidebar, content tables, and contextual editor panels.
- **Tablet:** Collapsible navigation and adaptable content/editor layouts.
- **Mobile:** Drawer navigation, stacked content cards or responsive tables, simplified editing controls, and accessible preview/publishing actions.
- Keep advanced SEO configuration available but progressively disclosed on smaller screens.

## 7. Design Notes

1. This is the **target-state information architecture**, not an MVP commitment.
2. Content types created through Content Models should appear within Content, rather than automatically crowding the global sidebar.
3. Site-level SEO tools should complement, not duplicate, page-level SEO settings in the editor.
4. Sitemap generation, lean HTML output, and many performance optimizations should be automatic system capabilities rather than manual workflows.
5. Agency Workspace is a possible future layer; site-level ownership transfer is part of the planned core architecture.
6. Before wireframing, prioritize MVP versus later features and validate terminology with representative content editors, marketers, and developers.
