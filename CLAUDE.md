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
- Routes: `(auth)` sign-in/up; `(account)` account-level pages; `(site)` site shell.
  `sites/[siteId]/[section]` is a placeholder for unbuilt sections; add a static route
  (e.g. `sites/[siteId]/content/page.tsx`) to replace one.
- Pin new dependencies to versions published at least two weeks ago.
