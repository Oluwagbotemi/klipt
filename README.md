# Klipt

An SEO-first, multi-site content management system: create content, publish fast pages, and control how search engines understand them.

See [`docs/product-documentation.md`](docs/product-documentation.md) for the product definition.

## Stack

- **App:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript
- **UI:** Tailwind CSS 4 · shadcn/ui (Radix) · Lucide icons
- **Data:** PostgreSQL · Drizzle ORM · PGlite (embedded Postgres for local development)
- **Auth:** Better Auth (email + password, sessions stored in Postgres)

## Getting started

No accounts or database install needed for local development.

```bash
npm install
cp .env.example .env.local     # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:seed                # optional: demo users and sites
npm run dev
```

Open http://localhost:3000 and sign in, or create an account.

Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `.data/pglite` and applies migrations automatically. PGlite allows one process at a time, so **stop the dev server before running `db:*` scripts**.

### Demo accounts (after `npm run db:seed`)

| Email               | Password          | Has                                                          |
| ------------------- | ----------------- | ------------------------------------------------------------ |
| `sam@klipt.test`    | `klipt-demo-1234` | 3 owned sites (one with a pending transfer), Editor on a 4th |
| `morgan@klipt.test` | `klipt-demo-1234` | Owner of Atlas Outdoor Supply                                |

These exist only in your local database. The seed script refuses to run against `DATABASE_URL` unless passed `--force`.

## Scripts

| Script                               | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| `npm run dev`                        | Start the dev server                                            |
| `npm run build`                      | Production build                                                |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript                                             |
| `npm test`                           | Unit and database tests (in-memory Postgres)                    |
| `npm run format`                     | Prettier                                                        |
| `npm run db:generate`                | Create a SQL migration after changing `src/server/db/schema.ts` |
| `npm run db:migrate`                 | Apply migrations (to `DATABASE_URL`, or local PGlite)           |
| `npm run db:seed`                    | Add demo data to the local database                             |
| `npm run db:reset`                   | Delete the local PGlite database, then migrate and seed         |

## Deploying (Vercel + Neon)

1. Create a Neon project and copy its pooled connection string.
2. In Vercel, set environment variables: `DATABASE_URL`, `BETTER_AUTH_SECRET` (new random value), `BETTER_AUTH_URL` (your production URL).
3. Set the build command to `npm run db:migrate && npm run build` so migrations run on each deploy.

## Status

Built: design tokens (light/dark), app shell (open-site tabs, collapsible section sidebar, breadcrumbs, section tabs, ⌘K search), sign-up/sign-in/sign-out, Sites list and Create site on a real database, with server-side authorization.
Next: Content library and editor. See §9 of the product documentation for the build sequence.
