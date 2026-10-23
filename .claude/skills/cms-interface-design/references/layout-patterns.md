# Layout and Screen Patterns

## Global hierarchy
Account -> Sites/Projects -> Selected Site -> CMS. Persistent site sidebar: Overview; Content and Media; Content Models, Navigation, Taxonomy; SEO, Performance; Team, Settings. Detailed pages appear inside their sections; do not put the full sitemap in one sidebar.

## Shell
**Decided (Oct 2026):** a sticky **top bar of open-site tabs** above a **left section sidebar**.
- Top bar (every signed-in page): Home (All sites), one tab per opened site (browser-style; remembers the last page in that site; × closes), + to open another site, then search (⌘K/Ctrl+K command menu), theme, account. Open tabs are a per-browser convenience in localStorage; site names and access always come from the server.
- Sidebar (lg+, ~240px, sticky under the top bar): New (quick create), sections grouped as below, collapse button. Collapses to an icon rail with tooltips; the preference applies before paint (`data-sidebar` on <html>). Below lg, sections open in a drawer from the top bar's menu button.
- Page header: breadcrumb (Site › Section › Tab), title, description, contextual primary action, and the section's secondary tabs along its bottom edge. Each tab has its own URL.
- Hide sections and tabs the member's role can't use; a direct URL to one shows a no-access state (server-enforced). Light theme can use soft-gray shell with white main working surface; dark theme uses subtle surface contrast. Do not apply a decorative giant container if it harms density on complex tables.

## Route archetypes
- Sites index: multi-site cards/table, owner/role badges, create site.
- Overview: actionable summaries, recent content, health issues; no invented real metrics. Built in
  the 2026 visual direction (reference implementation): greeting + status chips + period pills, quick
  action pills, 4 stat tiles, then a bento of Publishing chart (8) + dark "Next up" card (4), Needs
  attention (8) + SEO health donut (4), Recently edited (8) + Activity (4), then Setup / Your work /
  Core Web Vitals.
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
