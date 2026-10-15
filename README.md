# Klipt

An SEO-first, multi-site content management system: create content, publish fast pages, and control how search engines understand them.

See [`docs/product-documentation.md`](docs/product-documentation.md) for the product definition.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Lucide icons

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app currently runs on **sample data** (`src/lib/mock/`); there is no backend yet.

## Scripts

| Script              | Purpose              |
| ------------------- | -------------------- |
| `npm run dev`       | Start the dev server |
| `npm run build`     | Production build     |
| `npm run lint`      | ESLint               |
| `npm run typecheck` | TypeScript           |
| `npm run format`    | Prettier             |

## Status

Built: design tokens (light/dark), app shell (sidebar, site switcher, mobile drawer, theme toggle), Sites list.
Next: Site Overview, then Content library and editor. See §9 of the product documentation for the build sequence.
