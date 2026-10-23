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

| Email               | Password          | Role and what you'll see                                                                                                                  |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sam@klipt.test`    | `klipt-demo-1234` | Owner of Northwind Journal (25 entries), Harbor & Pine Studio (pending transfer) and Lumen Clinic (empty); Editor on Atlas Outdoor Supply |
| `morgan@klipt.test` | `klipt-demo-1234` | Owner of Atlas Outdoor Supply                                                                                                             |
| `riley@klipt.test`  | `klipt-demo-1234` | Author on Northwind Journal: can create content and archive only their own unpublished entries                                            |

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

## Content API (headless)

Klipt is headless: your own website fetches published content from `/api/v1` with a site API key
(create one in **Settings → Integrations**). See [`docs/content-api.md`](docs/content-api.md) for
endpoints, response shapes and a Next.js example. **Webhooks** (same page in Settings) notify your
website when content is published, edited, moved or unpublished.

## Deploying (Vercel + Neon)

1. In the Vercel project, open **Storage → Create Database → Neon** and connect it to the project. This sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
2. Add environment variables: `BETTER_AUTH_SECRET` (a new random value) and `BETTER_AUTH_URL` (your production URL, no trailing slash).
3. Set the build command to `npm run db:migrate && npm run build` so migrations run on each deploy, and make sure the production branch is `main`.
4. Demo accounts are not created in production; sign up on the live site.
5. **Media uploads:** in Vercel, open **Storage → Create → Blob**, create a store and connect it to
   the project (this sets `BLOB_READ_WRITE_TOKEN`), then redeploy. Without it, uploads show "File
   storage isn't set up yet". Locally, files are stored in `.data/media`.
6. Optional but recommended: add `CRON_SECRET` (any long random value). The daily job in
   `vercel.json` then publishes due scheduled entries and retries failed webhooks.
7. **Email:** add `RESEND_API_KEY` and `EMAIL_FROM` for Production (step by step in
   [`docs/email.md`](docs/email.md)), then redeploy. Without them Klipt sends no email: invitations
   and transfers stay shareable links and "Forgot password?" is hidden.

## Status

Built: design tokens (light/dark), app shell (open-site tabs, collapsible section sidebar, breadcrumbs, section tabs, ⌘K search), sign-up/sign-in/sign-out, Sites list and Create site, Content library, and the content editor (rich text with autosave and conflict detection, URL changes with 301 redirects, SEO and social fields with previews, advanced indexing controls, publish/schedule/review workflow, preview), the Media library (uploads with automatic resizing, alt text, usage, images in the editor), API keys, the read-only content delivery API, webhooks (signed, retried, with a delivery log) and draft previews on your own website (one-hour signed links), all on a real database with server-side authorization.
The site Overview shows content counts, what needs attention (reviews, alt text, SEO issues, failed webhooks), a setup checklist, recent content and activity.
Team: members and roles, invitations by email and as shareable links, a Roles & permissions overview.

SEO: recommendations for live pages (descriptions, titles, duplicates, thin content, alt text, broken links, noindex), internal links (broken links, pages nothing links to), a redirects manager that keeps redirects one hop, the sitemap with reasons pages are left out, and a site-wide search visibility switch.

Settings: general (name, language, time zone), your website's domain, SEO defaults (title template, default sharing image), ownership transfer (password-confirmed, accepted by the new owner via a link), and the danger zone (archive and restore, or delete with password and name confirmation).

Content models: custom content types (e.g. Product) and extra fields on any type (text, long text, number, date, yes/no, dropdown, image, link to content), with required fields checked on publish. Entries of custom types live under Content › Collections, and the content API returns every entry's `fields` with images and published links resolved.

Publishing settings: URL patterns per content type (e.g. posts at `/blog/{slug}` or `/blog/{yyyy}/{mm}/{slug}`) with a preview of which live addresses move and automatic one-hop 301 redirects, an optional "require review before publishing" rule (owners and admins exempt), the default type for the New button, and the live website and draft preview addresses in one place.

Taxonomy: nested categories (up to three levels), tags and custom taxonomies (e.g. Region, for the content types you choose), with entry counts, search, and a "Categories & tags" panel in the editor that saves on its own. Authors can assign terms to their own drafts and create new tags; editors and above manage all terms. The content API returns each entry's terms, filters by `category`, `tag` or `term`, lists terms with counts (`/taxonomies/{key}`), resolves archive paths like `/category/news`, and adds archive pages with published entries to the sitemap.

Account: profile (name, email, appearance), security (change password with an option to sign out other devices, signed-in devices you can sign out one by one or all at once), and account deletion (password and email confirmation; blocked while you own a site, so sites are transferred or deleted first).

Navigation: header and footer menus plus custom menus, with links to entries (they follow URL changes) or URLs, two levels of nesting, keyboard-friendly reordering, warnings for links to unpublished or deleted entries, save conflict detection, and `GET /api/v1/menus/{key}` for your website (plus an opt-in `menu.updated` webhook).

Team activity: a site-wide log under Team › Activity of who did what (content, media, structure, team, settings and integrations), grouped by day, with filters for person, kind and dates in the URL and links to what changed. Owners and admins see everything; editors see content, media and structure; authors and viewers don't see it. Autosave records at most one "edited" per person and entry every 15 minutes, a deleted account's name stays on its history, and entries older than a year are removed by the daily job.

Assignments: give an entry to a member with an optional due date (editor sidebar or Team › Assignments), see open work per person, reviews waiting, overdue and unassigned drafts, and filter Content by "Assigned to me". An author assigned someone else's draft can edit it and request review; editors approve (publish) or request changes with a note the writer sees on the entry. Assignment changes never conflict with autosave, are logged in Activity, and are cleared when someone leaves or loses content rights. People are emailed when they're assigned something, asked for a review, sent changes or approved (each can turn these off). The content API is unchanged.

Email (Resend): invitations (with the copyable link kept as a fallback, and "Resend email"), password reset ("Forgot password?" on sign-in), email confirmation on sign-up and after an email change (plus a notice to the old address), ownership transfer requests and their outcome, and assignment and review notifications with an on/off setting on the account page. Emails send after the response and never block an action. Without `RESEND_API_KEY`, local development saves them to a dev outbox you can read at `/dev/emails`. Setup: `docs/email.md`.

Performance: Core Web Vitals (LCP, INP, CLS, plus FCP and TTFB) from real visits, sent by your website with a public reporting key to `POST /api/v1/vitals` (code for Next.js and any website, origin-checked, no personal data stored). Overview with 75th-percentile values and good / needs improvement / poor shares, daily trend charts with data tables, per-page results linked to entries, oversized or unsized images from the media library, rule-based recommendations, mobile/desktop and 7/28-day filters, and a card on the site Overview. Setup: `docs/performance.md`.

Visual direction (phase 1): a new look for in-page content — white page with bordered white cards in equal-height rows, bold numbers that count up, purple used sparingly, tinted status chips, striped and geometric vectors, charts with tooltips and keyboard support — shared components in `src/components/visual/`, applied first to the site Overview (greeting, period pills, stat tiles, publishing chart, "Next up" card, SEO health donut, your work). Other screens follow.
