@AGENTS.md

# Klipt — SEO-first multi-site CMS

Product context: `docs/product-documentation.md`. UI work must follow the
`cms-interface-design` skill in `.claude/skills/cms-interface-design/` — load it
before creating or changing any screen.

## Commands

- `npm run dev` — dev server (needs `.env.local`; see `.env.example`)
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` — run all before handing off
- `npm run db:generate` after editing the schema; commit the generated `drizzle/` files
- `npm run db:reset` — fresh local database with demo data
- PGlite is single-process: stop the dev/prod server before running `db:*` scripts or `npm start`
  against the same `.data/pglite`. `npm start` locally needs `ALLOW_PGLITE_IN_PRODUCTION=1`.

## Architecture

- `src/server/db/schema.ts` — Drizzle schema. Every site-scoped table has `site_id`.
- `src/server/*.ts` — queries taking an explicit `userId`, always scoped to that user's
  memberships. Tested in `tests/` against in-memory PGlite. Never import from client code.
- `src/lib/data/*` — data access layer (`server-only`). Resolves the user from the session,
  then calls `src/server`. Pages, layouts and Server Actions use only this layer.
- Authorization: every Server Action calls `requireSitePermission(siteId, permission)` (or
  `requireUser()` for account-level actions) first. Pages call `getSite()` themselves; never
  rely on a layout's check, since layouts and pages render in parallel. Non-members get
  not-found. The permission matrix in `src/lib/permissions.ts` is provisional.
- `src/proxy.ts` only does an optimistic cookie check; it is not authorization.

## Conventions

- Next.js 16 with `cacheComponents`. Session reads (`requireUser`, `getSite`, …) are
  request-time: render them inside `<Suspense>` or a route with `loading.tsx`, and never await
  them (or `params`) at the top of a layout. In data helpers, read `headers()` before touching
  the database so prerendering never connects to it.
- Design tokens live only in `src/app/globals.css` (`:root` and `.dark`). No raw hex in JSX.
- Theme: `.dark` class on `<html>`, set before paint by `src/lib/theme.ts`; light is default.
- UI primitives in `src/components/ui/` follow shadcn/ui (Radix via `radix-ui`). The shadcn
  registry may be blocked in cloud sessions; write components by hand if so.
- Modals: only `Dialog`/`AlertDialog` from `src/components/ui/` (layout in `ui/modal-layout.tsx`). Every
  modal is a 4px glass frame (`.modal-glass`: `--glass-fill`, `--glass-highlight`, `--glass-edge`) over a
  blurred scrim (`.modal-overlay`, `--overlay`), around a `--modal-panel` panel with
  `DialogHeader icon={…}` (title + description; `centered` for success), `DialogBody` (the `--modal-body`
  card, which scrolls) and `DialogFooter` (equal-width buttons, cancel left). Forms wrap all three in
  `DialogForm`. Sizes: `sm` 400px (confirmations; AlertDialog default), `md` 560px, `lg` 720px (forms;
  Dialog default). Below `sm` every modal is a bottom sheet (CSS only). Create site is a modal from
  `CreateSiteProvider` in both shells (`useCreateSite()`); `/sites/new` shows the list with it open.
- Forms: `FormField` for labelled inputs, `InlineAlert` for form-level errors, Server Actions
  with `useActionState` that return field errors and preserve submitted values.
- Navigation (decided; overrides "persistent sidebar" wording elsewhere): top bar of open-site
  tabs (`components/shell/open-sites-bar.tsx`, shared by account and site shells) + collapsible
  section sidebar (`site-sidebar.tsx`). Sections and their tabs live in `src/lib/navigation.ts`,
  each with an optional `permission` that hides it (display only).
- Routes: `(auth)` sign-in/up; `(account)` account-level pages; `(site)` site shell.
  `sites/[siteId]/[section]` and `.../[section]/[tab]` are placeholders for unbuilt pages. To
  build one, add a static route (e.g. `sites/[siteId]/content/page.tsx`) plus a
  `content/layout.tsx` that renders `<SectionLayout section="content">`, so the breadcrumb, title
  and tabs stay consistent. Pages still authorize themselves via `getSite()`.
- Content: list views live in `sites/[siteId]/content/(list)/` (route group so the entry page
  at `content/[entryId]` gets its own header). List state is in the URL (`q`, `status`, `sort`,
  `page`) parsed by `parseContentListParams`. Per-entry rights come from `entryActions()` in
  `src/lib/content.ts`; `applyBulkAction` re-checks them server-side and skips the rest.
  Server Actions that change data call `refresh()` from `next/cache`.
- Editor: bodies are Tiptap JSON in `content_entries.data.body`. `src/lib/editor/rich-text.ts` holds
  the one extension set used by the browser editor and server rendering; `sanitizeDoc()` runs on
  every save and before rendering. Add a node/mark there (and to the sanitizer allow-list) or it
  is stripped. Send editor JSON to Server Actions as plain JSON (stringify/parse first).
- Editor writes (`src/server/editor.ts`) lock the row and compare `expectedUpdatedAt`; a mismatch
  is a `ConflictError`, never a silent overwrite. Slug changes on published entries create 301s
  without chains or loops. Scheduled entries are promoted by `publishDueEntries()` on read until a
  background job exists. SEO length hints are guidance only and never block publishing.
- Delivery is headless (decided): customer websites read `/api/v1/*` with a site API key
  (`src/app/api/v1`, guide in `docs/content-api.md`). Handlers wrap their work in `handleDelivery()`
  from `src/lib/data/delivery.ts`, which authenticates the key and picks the site;
  `src/server/delivery.ts` is the one place scoped by key instead of `userId` and must only return
  published content. Keys are stored as SHA-256 hashes, shown once, managed by `api_keys.manage`.
- Webhooks (`src/server/webhooks.ts`): content writes call `enqueueEntryEvent(tx, …)` inside their
  transaction (outbox in `webhook_deliveries`); a new event that changes what's live must be queued
  there too. Sending happens via `scheduleWebhookDelivery()` (`after()`) from Server Actions,
  `handleDelivery` and content reads, plus the daily cron `/api/cron/webhooks`. Customer URLs go
  through `src/server/webhook-url.ts` (no private networks); signing secrets are encrypted with
  `src/server/secrets.ts`.
- Previews (`src/server/previews.ts`): `sites.preview_url` is the customer's preview route; the editor
  opens it with a stateless 1-hour HMAC token (HKDF from `BETTER_AUTH_SECRET`, info
  `preview-tokens/v1`) for one entry. `GET /api/v1/preview` needs the API key and a token for that
  key's site; `getPreviewEntry()` is the only delivery query that returns unpublished content.
- Media: files go through `uploadMedia()` (`src/server/media.ts`), which identifies the type from the
  bytes (`src/server/file-type.ts`; no SVG) and stores via `getStorage()` (`src/server/storage.ts`:
  Vercel Blob with `BLOB_READ_WRITE_TOKEN`, else `.data/media` served by `/media/[...key]`). Uploads
  are Server Actions limited to 4 MB (Vercel's request cap); the browser resizes larger photos first.
  Body images are `image` nodes with `mediaId`; `resolveMediaInDoc()` swaps in the current URL, alt
  text and size before rendering. Authors manage only their own uploads (`canManageMedia`).
- SEO: page checks live in `src/lib/seo-audit.ts` (pure, shared by Overview and the SEO section);
  `loadSiteAudit()` in `src/server/seo.ts` feeds them. Redirects saved there stay one hop (targets
  are followed, older redirects re-pointed, loops and live paths refused). `sites.allow_indexing`
  false makes the content API send noindex everywhere and an empty sitemap.
- Overview (`src/server/overview.ts`): one query bundle per visit, counted from real records only
  (no estimated metrics). Integration activity, setup steps and webhook failures are limited to
  members who manage integrations.
- Team (`src/server/team.ts`): invitations are shareable links (token hashed for lookup, encrypted so
  managers can copy it again; 7 days; must be accepted by an account with the invited email). Only
  the owner grants Admin or manages admins; nobody changes the owner (that's ownership transfer).
- Settings (`src/server/site-settings.ts`, `src/server/ownership.ts`): transfer, archive and delete
  re-check the password (`verifyCurrentPassword`). Transfers change nothing until the named
  recipient accepts; acceptance demotes or removes the old owner and promotes the new one in one
  transaction. Archived sites vanish for everyone (getSiteRole ignores them) except the owner's
  Archived sites list. SEO defaults (title template, default OG image) feed the content API.
- Content models (`src/server/models.ts`, rules in `src/lib/models.ts`): field definitions live in
  `content_models.fields`, values in `content_entries.data[fieldKey]` beside `body`. Field keys and types
  never change after creation (removing a field keeps stored values, unseen). `saveEntry` validates
  values against the model (`validateFieldValues` + `assertFieldTargets`: images and linked entries
  must belong to the site); drafts may be incomplete, publish/schedule refuse missing required fields.
  Delivery resolves `fields` in batch: images → absolute URL/alt/size, links → published targets only.
  Changing models needs `models.manage`; a custom model can be deleted only with no entries and no
  links to it.
- Taxonomy (`src/server/taxonomy.ts`, rules in `src/lib/taxonomy.ts`): every site has system `category`
  (nested, max 3 levels, no cycles) and `tag` taxonomies (created in `createSite`, backfilled by
  migration 0008); custom ones list their `modelKeys` and need `models.manage`. Terms need
  `taxonomy.manage`, except authors may create tags (`canCreateTerm`). Taxonomy keys and model keys
  share one namespace (both are URL prefixes). Assigning terms (`setEntryTerms`) needs edit rights,
  never bumps the entry's `updatedAt` (no autosave conflicts) and queues `entry.updated` for live
  entries; term edits/deletes queue it for the live entries using them. Archive paths: `termPath()`.
- Navigation (`src/server/menus.ts`, `src/lib/menus.ts`): header/footer menus are created lazily per
  site; custom menus need `navigation.manage`. Max depth 2 (`MAX_MENU_DEPTH`). The editor sends a flat
  ordered list with `depth`; `saveMenu` replaces all items, checks `expectedUpdatedAt` (conflict, never
  overwrite) and queues the opt-in `menu.updated` webhook via `enqueueSiteEvent`. Entry items store
  `entryId` (links follow URL changes); the API (`/api/v1/menus/{key}`) omits unpublished or deleted
  targets and their children. Reorder logic is pure in `src/lib/menu-tree.ts`.
- Account (`src/server/account.ts`, rules in `src/lib/account.ts`, pages `/account` and
  `/account/security`): name and email changes go straight to `users` (email lowercased, unique,
  stored unverified; needs the current password). Password changes use Better Auth
  `changePassword` (hashing only; "sign out other devices" deletes the other sessions ourselves, since
  Better Auth's option replaces the current session mid-request). Sessions are listed/revoked by id for the signed-in user only; tokens never reach the browser.
  Deleting an account needs the password and the typed email, is refused while the user owns any
  site (archived included), and relies on FKs: memberships/sessions cascade, authorship and
  "created by" columns (content, media, keys, webhooks, transfers) are set to null.
- Activity (`src/server/activity.ts`, vocabulary in `src/lib/activity.ts`): the log is `audit_events`, written in
  the same transaction as the change (`recordActivity` or a module's audit helper) with display snapshots
  (title, name, email…) in `metadata`. Give new actions a sentence in `describeActivity()` and a kind via
  `KIND_PREFIXES`. Autosave goes through `recordEntryEdit` (one "edited" per person/entry per 15 min).
  `activity.view` (owner/admin/editor) sees content, media and structure; `activity.view_all` (owner/admin)
  sees team, settings and integrations too. `keepActorName` runs before an account is deleted; the daily
  cron prunes rows older than a year.
- Assignments (`src/server/assignments.ts`, rules in `src/lib/assignments.ts`): `content_entries.assignee_id`
  and `due_on`; changing them keeps `updatedAt` (no autosave conflicts) and is logged. `content.assign`
  assigns anyone who creates content (authors: drafts/in review only); authors may only take on their own
  entries or let go. An assigned author can edit the entry like their own (`canEditEntry`). Reviewers send
  in-review entries back with `request_changes` (+ note in `review_feedback`, cleared on resubmit/publish).
  `clearAssignments` runs when a member leaves, is removed or loses `content.create`. Lists filter with
  `assignee=me|none|<userId>`.
- Email (`src/server/email/`, setup guide `docs/email.md`): `sendEmail()` posts to Resend with
  `RESEND_API_KEY` (from `EMAIL_FROM`), else writes to the dev outbox `.data/emails` (outside production
  or with `ALLOW_DEV_OUTBOX=1`; viewer at `/dev/emails`, localhost only), else sends nothing. Never send
  inline: `sendInBackground()` (or `sendLater()`/`notifyAboutEntry()` in `src/lib/data/email.ts`) runs
  after the response, logs failures and never fails the action. Templates (`templates.ts`) escape
  everything and include a text part. Who gets what lives in `src/server/notifications.ts`: never the
  actor; assignment/review emails only to current members with `users.notify_assignments` on; security
  emails (invitations, password reset, verification, email-change notice, transfers) always. Better Auth
  hooks in `src/server/auth.ts` send reset links to `/reset-password?token=` (sessions revoked on reset)
  and verification links that land on `/email-verified`; verification is never required to sign in.
  UI checks `isEmailEnabled()` and keeps copyable links as the fallback. Invitations can be re-emailed
  once a minute (`site_invitations.emailed_at`).
- Performance (`src/server/performance.ts`, rules in `src/lib/performance.ts`, guide `docs/performance.md`):
  real-user Core Web Vitals only, never estimates. The customer's website posts batches to
  `POST /api/v1/vitals` (`src/lib/data/vitals-ingest.ts`) with the site's public `sites.vitals_key`
  (created on first visit, replaced by `performance.manage`); the Origin must be the site's domain
  (± www) or preview origin (`allowedOrigins`). Ingest aggregates into `web_vitals_daily` histograms
  (fixed bucket edges per metric; Google's thresholds are edges) — no raw events, IPs or user agents —
  with daily caps in `web_vitals_usage`; p75 is interpolated within a bucket. The daily cron prunes
  rows older than 90 days. Pages, Assets (media checks) and Recommendations (fixed rules) need
  `performance.view` (owner/admin/editor).
- Public paths: every entry path comes from `entryPath(rules, modelKey, slug, entryDate(entry))` in
  `src/lib/url-patterns.ts`, with the site's `PathRules` (`sites.url_patterns` + time zone, loaded by
  `loadPathRules()` in `src/server/path-rules.ts`; delivery carries them on `DeliverySite.pathRules`).
  Defaults: pages `/{slug}`, posts `/posts/{slug}`, other types `/<key>/{slug}`; term archives stay
  `termPath()`. Patterns end with `{slug}` and may use `{yyyy}`/`{mm}` (first publish date, site time
  zone); `/resolve` matches with `matchPath()` then checks the entry's own path. Never build a path by
  hand.
- Publishing (`src/server/publishing.ts`, Settings › Publishing, `site.update`): `saveUrlPatterns` stores
  only non-default patterns, refuses overlaps (`validatePatterns`, term archives included) and, for every
  published entry that moves, adds a one-hop 301 (re-points redirects to the old path, deletes redirects
  from now-live paths) and queues `entry.slug_changed`, in one transaction. New model and taxonomy keys
  are checked with `findPathClash`. `sites.require_review` (`WorkflowRules`, passed to
  `workflowActions`): editors must request review and can't approve entries they sent
  (`content_entries.review_requested_by_id`); owners/admins bypass; `transitionEntry` enforces it.
  `sites.default_model_key` drives the split "New" button on All content. The preview route is edited
  here (Environments), not under Integrations.
- Pin new dependencies to versions published at least two weeks ago.
