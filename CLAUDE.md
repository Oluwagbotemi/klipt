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
- Media: files go through `uploadMedia()` (`src/server/media.ts`), which identifies the type from the
  bytes (`src/server/file-type.ts`; no SVG) and stores via `getStorage()` (`src/server/storage.ts`:
  Vercel Blob with `BLOB_READ_WRITE_TOKEN`, else `.data/media` served by `/media/[...key]`). Uploads
  are Server Actions limited to 4 MB (Vercel's request cap); the browser resizes larger photos first.
  Body images are `image` nodes with `mediaId`; `resolveMediaInDoc()` swaps in the current URL, alt
  text and size before rendering. Authors manage only their own uploads (`canManageMedia`).
- Default public paths (`entryPath`): pages `/slug`, posts `/posts/slug`, until URL patterns exist.
- Pin new dependencies to versions published at least two weeks ago.
