@AGENTS.md

# Klipt — SEO-first multi-site CMS

Product context: `docs/product-documentation.md`. UI work must follow the
`cms-interface-design` skill in `.claude/skills/cms-interface-design/` — load it
before creating or changing any screen.

## Commands

- `npm run dev` — dev server
- `npm run lint` / `npm run typecheck` / `npm run build` — run all three before handing off
- `npm run format` — Prettier (with Tailwind class sorting)

## Conventions

- Next.js 16 App Router with `cacheComponents` enabled. Don't await `params`,
  `cookies()` or `headers()` at the top of a layout; push the await down into a
  `<Suspense>` boundary (see `src/app/(site)/sites/[siteId]/layout.tsx`).
- Design tokens live only in `src/app/globals.css` (`:root` and `.dark`). No raw hex in JSX.
- Theme: `.dark` class on `<html>`, set before paint by `src/lib/theme.ts`; light is default.
- UI primitives in `src/components/ui/` follow shadcn/ui (Radix via `radix-ui`).
  The shadcn registry may be blocked in cloud sessions; write components by hand if so.
- Data access goes through `src/lib/data/*` (server-only). It currently returns
  MOCK fixtures from `src/lib/mock/`; views using it must show `<MockDataNotice />`.
- Routes: `(account)` group = account-level pages; `(site)` group = site shell.
  `sites/[siteId]/[section]` is a placeholder for unbuilt sections; add a static
  route (e.g. `sites/[siteId]/content/page.tsx`) to replace one.
