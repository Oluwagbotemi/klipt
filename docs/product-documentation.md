# SEO-Friendly CMS — Product Documentation

**Status:** Working product definition · **Version:** 1.0 · **Updated:** 15 October 2026

> This document describes the product vision, users, features, information architecture, key journeys, and design/technical direction. It is a planning reference, **not** a commitment that every feature is in the MVP.

## 1. Product overview

A web-based, mobile-responsive content management system (CMS) that enables teams to create, organize, optimize, and publish website content while maintaining direct control over search metadata, readable URLs, structured content, and technical SEO fundamentals. The platform aims to support fast, lean website output without forcing editors to understand implementation details.

**Product promise:** Create content. Publish fast pages. Control how search engines understand them.

### Product goals

- Make everyday content creation and publishing simple.
- Make SEO controls discoverable, understandable, and actionable.
- Enable structured, reusable content for varied website types.
- Support clean URLs, sitemaps, redirects, indexing rules, and structured data.
- Encourage strong web performance, including Core Web Vitals (LCP, INP, CLS).
- Support collaboration, multi-site management, and secure site ownership handoff from agencies to clients.

### Product principles

1. **Hide complexity, not capability:** common controls are prominent; technical controls use progressive disclosure.
2. **SEO within the workflow:** help editors optimize as they create, not only after publishing.
3. **Clear ownership:** distinguish account, workspace (if introduced), site, and content ownership.
4. **Safe changes:** preview consequential actions, especially URL changes, publishing, and ownership transfer.
5. **Responsive by design:** adapt dense desktop workflows intentionally for mobile.
6. **Performance by architecture:** fast output is an engineering outcome; an analytics screen alone cannot guarantee it.

## 2. Users and permissions

| User type                  | Main jobs                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ |
| Content editor             | Write, edit, preview, optimize, and publish content                            |
| SEO / marketing specialist | Manage metadata, links, redirects, schema, indexing, and SEO issues            |
| Developer                  | Define models, integrations, APIs, templates/output, and technical performance |
| Site owner / administrator | Manage settings, members, permissions, domains, billing, and ownership         |
| Agency                     | Create and manage client sites, collaborate, then transfer ownership           |

**Candidate system roles:** Owner, Admin, Editor, Author, Viewer. These are permission levels, not personas. A detailed permission matrix remains to be finalized. Server-side authorization is required for all privileged actions.

## 3. Product structure and navigation

### Account level

```text
Account
├── Sites / Projects
│   ├── All Sites
│   ├── Create Site
│   └── Open Site
├── Profile
├── Security
└── Notifications

Future: Agency Workspace
├── Client Sites
├── Clients
├── Workspace Team
└── Workspace Billing
```

### Inside a selected site

```text
Site
├── Overview
│   ├── Site Summary
│   ├── Recent Content and Activity
│   ├── SEO Health Summary
│   ├── Performance Summary
│   └── Quick Actions
├── Content
│   ├── All Content
│   ├── Pages
│   ├── Posts / Articles
│   ├── Collections / Custom Content
│   └── Content Editor
│       ├── Content and Media
│       ├── URL / Slug
│       ├── Page SEO
│       ├── Social Preview
│       ├── Schema
│       ├── Preview
│       └── Publishing
├── Media
│   ├── Library
│   ├── Upload
│   └── Media Details
├── Content Models
│   ├── Models
│   ├── Model Editor / Fields
│   ├── Validation and Relationships
│   └── Schema Mapping
├── Navigation
│   ├── Menus
│   └── Menu Editor
├── Taxonomy
│   ├── Categories
│   ├── Tags
│   └── Custom Taxonomies
├── SEO
│   ├── Overview / Issues
│   ├── Page SEO Audit
│   ├── Internal Links
│   ├── Redirects
│   ├── Sitemap
│   └── Crawling and Indexing
├── Performance
│   ├── Overview
│   ├── Core Web Vitals
│   ├── Page / Asset Performance
│   └── Recommendations
├── Team
│   ├── Members and Invitations
│   ├── Roles and Permissions
│   ├── Content Assignments
│   └── Activity
└── Settings
    ├── General
    ├── Domains
    ├── Publishing
    ├── SEO Defaults
    ├── Integrations / API / Webhooks
    ├── Billing and Plan
    ├── Ownership
    │   ├── Current Owner
    │   ├── Transfer Ownership
    │   ├── Pending Transfer
    │   └── Transfer History
    └── Danger Zone
```

**Recommended persistent sidebar:** Overview; Content; Media; Content Models; Navigation; Taxonomy; SEO; Performance; Team; Settings. Use secondary navigation within sections instead of exposing every subpage in the sidebar.

**Decided (Oct 2026):** the sidebar holds a site's sections; a top bar holds browser-style tabs for the sites a user has open (plus Home, search, theme and account). Sub-pages are tabs under each page title, with breadcrumbs above it.

## 4. Feature inventory

### 4.1 Overview / Dashboard

- Site summary, recent content, drafts, publishing activity, quick-create actions.
- SEO issues and performance summaries with links to detailed views.
- Recent team activity and items needing attention.

### 4.2 Content management

- Create, edit, duplicate, delete, archive, search, filter, and sort pages/posts/custom content.
- Draft, in-review, scheduled, published, and archived statuses.
- Preview, publish/unpublish, scheduled publishing, autosave, revision history, restore, and bulk actions.

### 4.3 Content editor

- Title, rich-text/body content, headings, links, lists, tables, embeds, media, reusable blocks.
- Editable slug, SEO fields, social preview, schema, preview, and publishing controls.
- Responsive page previews and clear unsaved-change states.

### 4.4 Content models

- Custom content types with text, rich text, number, date, boolean, selection, media, and reference fields.
- Field ordering, required/optional fields, validation, reusable components, relationships, and model templates.
- Schema.org field mapping where supported.

### 4.5 Media library

- Upload, search, filter, preview, replace, and manage files/images.
- Alt text, captions, dimensions, file size, usage locations, and missing-alt warnings.
- Image optimization and responsive image delivery as implementation capabilities.

### 4.6 Page-level SEO

- SEO title separate from visible H1; meta description; editable slug; canonical URL.
- Index/noindex and follow/nofollow controls.
- Image alt text, Open Graph title/description/image, search and social previews.
- Structured data settings, completeness feedback, and actionable warnings.
- Character counts may be guidance, not strict guarantees of search snippet display.

### 4.7 Site-wide SEO

- SEO health summary, missing/duplicate metadata, missing alt text, indexing visibility, and recommendations.
- Global metadata and social defaults.

### 4.8 URLs and redirects

- Human-readable, unique slugs; URL patterns; URL change detection/history.
- Offer to create a 301 redirect when a published URL changes.
- Manage redirects, bulk operations, loop detection, and destination checks.

### 4.9 Sitemaps and crawling

- Automatically generated XML sitemaps for eligible published URLs.
- Sitemap inclusion controls, preview/status, robots.txt configuration, and indexing rules.
- Advanced controls must warn about possible search-visibility consequences.

### 4.10 Structured data

- Schema.org types such as Article, Organization, Person, Product, Event, FAQ, and Breadcrumb where relevant.
- Model-to-schema mappings, generated structured data, preview, and validation.
- Schema validity does not guarantee rich-result eligibility.

### 4.11 Internal linking and taxonomy

- Link to existing content, find broken links, inspect incoming/outgoing links.
- Categories, tags, nested categories, custom taxonomies, and taxonomy metadata/URLs.
- Orphan-page detection and intelligent linking suggestions are potential later capabilities.

### 4.12 Performance

- Page/site performance reporting when a reliable data source is connected.
- Core Web Vitals: Largest Contentful Paint (LCP), Interaction to Next Paint (INP), Cumulative Layout Shift (CLS).
- Asset warnings, image optimization guidance, lean HTML, and responsible loading strategies.
- Clearly distinguish measured field data, lab estimates, and unavailable data.

### 4.13 Navigation

- Header/footer/custom menus, nested links, ordering, internal/external destinations, preview.

### 4.14 Collaboration and publishing

- Invitations, membership, roles, assignments, review/approval workflow, activity log.
- Content revisions, authorship, scheduling, and publishing history.

### 4.15 Site settings and integrations

- Site name, URL, language, timezone, logo/favicon, domains, publishing defaults, environments.
- SEO/social defaults, integrations, APIs, API keys, webhooks, billing, archive/delete site.

### 4.16 Site ownership transfer

- Transfer a **specific site**, not the owner's entire account.
- Invite/select recipient; require appropriate owner authorization and re-authentication.
- Recipient accepts or declines; current owner can cancel while pending.
- Ownership changes only on acceptance; record the transfer and notify relevant parties.
- Choose whether the agency retains an Admin role or exits after transfer.
- Review billing, domains, credentials, and external integrations separately; ownership of third-party services may require additional steps.
- Prevent conflicting simultaneous transfers and preserve an auditable history.

### 4.17 Developer and delivery capabilities

- Content delivery/management APIs, API credentials, webhooks, preview delivery, environments, deployment integrations.
- Architecture decision still open: headless, hybrid, or coupled rendering. SEO/performance promises depend on the frontend and hosting implementation as well as the CMS.

## 5. Critical user journeys

### A. Create and publish a page

`Select Site → Content → Create Page → Choose Type → Enter Content → Set Slug → Review SEO → Preview → Publish → View Live Page`

### B. Change a published URL

`Edit Page → Change Slug → Show Impact Warning → Offer 301 Redirect → Confirm → Publish → Verify Redirect`

### C. Create a structured content model

`Content Models → Create Model → Add Fields → Configure Validation/Relationships → Optional Schema Mapping → Save → Create Entries`

### D. Resolve an SEO issue

`Overview / SEO → Open Issue → See Affected Content → Edit Field or Setting → Save → Recheck Status`

### E. Agency-to-client ownership transfer

`Agency Opens Site → Settings → Ownership → Select/Invite Client → Review Access/Billing/Integrations → Re-authenticate → Send Transfer → Pending → Client Accepts → Ownership Updated → Agency Retained as Admin or Removed`

**Transfer states:** Not started, Pending, Accepted, Declined, Cancelled, Expired, Failed. Exact expiry policy remains undecided.

## 6. Experience and interface direction

**Approved direction:** Minimal, soft, structured professional SaaS UI inspired by supplied references.

- **Stack:** Next.js + TypeScript + Tailwind CSS + shadcn/ui.
- **Themes:** Light and dark; light default.
- **Accent:** Purple, initial proposed light-theme token `#635BFF` (verify contrast and dark-theme pairing).
- **Surfaces:** Neutral backgrounds, restrained borders/shadows, generous space for focused tasks.
- **Data views:** Denser tables and analytics when information needs require them.
- **Navigation:** Persistent desktop sidebar, clear page headers, tabs/secondary navigation; adaptive mobile navigation.
- **Accessibility:** Keyboard support, visible focus, semantic labels, sufficient contrast, reduced-motion preferences.
- **States:** Loading, empty, error, success, disabled, pending, permission denied, unsaved changes.
- **Security UX:** Strong confirmation for deletion, sensitive settings, and ownership transfer.

The coding-agent skill is the authoritative reference for detailed design tokens, components, responsive patterns, and implementation conventions.

## 7. Scope and prioritization

The feature inventory is the **full vision**. A proposed planning split (subject to product validation) is:

| Stage            | Candidate scope                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MVP**          | Account/site selection, site shell, basic roles, pages/posts, essential editor, drafts/publish/preview, media and alt text, metadata/slugs, basic content models, sitemap, basic redirects, core settings, secure ownership transfer |
| **V1 expansion** | Richer publishing workflows, revisions, scheduling, taxonomy, navigation editor, schema mapping, SEO audit, global defaults, integrations, advanced permissions                                                                      |
| **Later**        | Extensive performance reporting, orphan-page/link recommendations, sophisticated agency workspace, complex automation, advanced developer tooling                                                                                    |

This is a **recommendation**, not an approved release plan. Validate primary customers, engineering feasibility, and business model before locking it.

## 8. Open product decisions

1. Who is the initial buyer: agencies, small businesses, marketing teams, or developers?
2. Will sites be hosted/rendered by the product, or will it be headless-first?
3. What page-building capability is required: structured editor only, reusable blocks, or full visual builder?
4. What are the exact MVP boundaries and success measures?
5. Which permissions does each role receive, especially for publishing and billing?
6. How do ownership transfer, billing transfer, domains, and external integrations interact?
7. What is the content model migration policy when fields change?
8. Which SEO/performance data sources and checks are supported?
9. What should be editable from mobile versus review-only?
10. What is the pricing/tenant model for single-site customers and agencies?

## 9. Suggested design sequence

1. Account onboarding and Sites/Projects.
2. Shared app shell, navigation, and theme behavior.
3. Site Overview.
4. Content library and content creation.
5. Content editor and page-level SEO.
6. Media library and content models.
7. SEO management, redirects, sitemap, and taxonomy.
8. Team, permissions, settings, and ownership transfer.
9. Responsive refinements, accessibility, and comprehensive states.

---

**Use of this document:** Product context for design, engineering planning, and coding-agent prompts. Update decisions and release scope as the product evolves.
