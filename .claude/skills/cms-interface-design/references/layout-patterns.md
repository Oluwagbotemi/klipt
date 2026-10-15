# Layout and Screen Patterns

## Global hierarchy
Account -> Sites/Projects -> Selected Site -> CMS. Persistent site sidebar: Overview; Content and Media; Content Models, Navigation, Taxonomy; SEO, Performance; Team, Settings. Detailed pages appear inside their sections; do not put the full sitemap in one sidebar.

## Shell
Desktop: fixed or sticky left navigation (~240–280px), main area flexes; page header contains title, optional description, breadcrumb, and contextual primary action. Light theme can use soft-gray shell with white main working surface; dark theme uses subtle surface contrast. Do not apply a decorative giant container if it harms density on complex tables.

## Route archetypes
- Sites index: multi-site cards/table, owner/role badges, create site.
- Overview: actionable summaries, recent content, health issues; no invented real metrics.
- Content index: search, type/status filters, sortable table/list, create CTA, bulk actions.
- Content editor: title/content primary column; secondary publishing/SEO settings in tabs, accordion, or side panel. Preserve edit state and clear save/publish status.
- Media: grid/list toggle, uploader, media detail drawer, alt text and usage.
- Models: model list, schema/field editor, validation and relationship configuration.
- SEO: overview and issue list, per-page diagnostics, redirects, sitemap, indexing; advanced controls progressively disclosed.
- Performance: summaries with metric source and time window; detailed chart and actionable issue panels.
- Team: members, roles, invites, activity.
- Settings: left subsection nav or tabs; Ownership is under site Settings.

## Routing suggestions (adapt to repository)
`/sites`, `/sites/new`, `/sites/[siteId]/overview`, `/sites/[siteId]/content`, `/sites/[siteId]/content/[entryId]`, `/sites/[siteId]/media`, `/sites/[siteId]/models`, `/sites/[siteId]/navigation`, `/sites/[siteId]/taxonomy`, `/sites/[siteId]/seo`, `/sites/[siteId]/performance`, `/sites/[siteId]/team`, `/sites/[siteId]/settings/ownership`.

## Density
Use whitespace for page-level hierarchy and denser spacing inside rows and analytics. Empty states are centered within the content region, with concise message and one primary action. Avoid dead space on content-rich screens.
