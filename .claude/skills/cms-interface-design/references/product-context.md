# Product Context and Scope

## Positioning
A responsive, web-based, SEO-friendly CMS for managing website content, with fast output, clean URLs, structured content, and direct metadata control. UX must support novice content editors and expert SEO/developer users.

## User types
- Content editor: create, preview, optimize, and publish content.
- SEO/marketing specialist: metadata, redirects, indexing, schema, links, diagnostics.
- Developer: content models, integrations, schema mappings, performance implementation.
- Site owner/admin: domains, users, roles, billing, and site ownership transfer.
- Agency: manage multiple client sites and hand them off securely.

Personas and permissions are distinct. Candidate roles: Owner, Admin, Editor, Author, Viewer; permission matrix is provisional and must be enforced on server.

## Product pillars and feature inventory
1. Overview: recent content, publishing activity, SEO and performance summaries, quick actions.
2. Content: pages, posts, collections, statuses, search/filter, drafts, preview, scheduling, archive, revisions, autosave, bulk operations.
3. Editor: rich text, blocks, media, title, slug, metadata, social preview, schema, publishing.
4. Models: custom types, reusable components, fields, validation, references, schema mapping.
5. Media: upload, alt text, caption, dimensions, optimization, usage, file management.
6. SEO: per-page title/description, canonical, index/follow, social metadata, preview, audit findings, site defaults.
7. URL and redirects: readable slugs, uniqueness, URL-change warnings, 301 redirect management, loop checks.
8. Sitemap and crawling: auto-generated XML sitemap, inclusion rules, robots/indexing settings.
9. Structured data: schema.org mappings, schema previews, validation and content-model integration.
10. Internal linking and taxonomy: relationships, broken links, categories, tags, custom taxonomies.
11. Performance: CWV (LCP, INP, CLS), image/asset recommendations, lean HTML and responsible rendering.
12. Navigation: menus, nesting, ordering, header/footer.
13. Collaboration: invites, roles, content assignments, review workflow, activity, revisions.
14. Site administration: general, domains, publishing, SEO defaults, integrations, API/webhooks, billing, ownership, danger zone.
15. Multi-site account: site selector, create site, account profile/security/notifications; agency workspace is a future capability.

## MVP versus future
The inventory above is the **vision**, not an approved MVP. Do not treat every item as implemented or promise delivery without prioritization. For new tasks, scope to the requested route and use clearly marked placeholders or feature flags for later capabilities. Potential later items include intelligent internal-link suggestions, agency workspace, extensive analytics, and complex workflow automation.

## Core UX principles
- Hide complexity, not capability.
- Optimize content during creation rather than as an afterthought.
- Never block publishing on optional SEO guidance unless a true validation/policy requirement exists.
- Explain jargon inline and show actionable remediation.
- Support multi-site selection and secure client handoff.
- Performance is partly an output architecture concern; a dashboard cannot guarantee Core Web Vitals.
