# Content delivery API

Klipt is **headless**: it stores and manages content, and your own website shows it with its own
design. Your website reads published content from Klipt over HTTPS with a site API key.

```text
Editor in Klipt ──publish──▶ Klipt database ◀──GET /api/v1/...── Your website ──▶ Visitors
```

## 1. Create an API key

In Klipt, open your site, then **Settings → Integrations → Create API key**. Owners and admins can
do this.

- The key is shown **once**. Copy it into your website's server environment, e.g. `KLIPT_API_KEY`.
- Keep keys on the server. Anyone who sees a key can read the site's published content, so don't
  put it in browser JavaScript or commit it to Git.
- Use one key per website or app. Revoking a key stops it immediately.
- Keys are read-only and only return **published** content of the site they belong to.

## 2. Make requests

Base URL: `https://<your-klipt-domain>/api/v1` (shown on the Integrations page).

Send the key as a bearer token:

```bash
curl "https://klipt.example.com/api/v1/entries?type=post" \
  -H "Authorization: Bearer $KLIPT_API_KEY"
```

### Endpoints

| Request                          | Returns                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `GET /site`                      | Site name, domain, URL, language and timezone                           |
| `GET /entries`                   | Published entries, newest first. Query: `type`, `page`, `limit` (≤ 100) |
| `GET /entries/{type}/{slug}`     | One published entry with its body and SEO                               |
| `GET /resolve?path=/posts/hello` | What's at a URL on your site: an entry, a redirect, or 404              |
| `GET /sitemap`                   | `path`, `url` and `lastModified` for every page that belongs in sitemap |
| `GET /redirects`                 | Every redirect: `from`, `to`, `statusCode`                              |

`type` is a content type key: `page`, `post`, or a custom model's key.

### Responses

Lists:

```json
{
  "data": [
    {
      "id": "…",
      "type": "post",
      "title": "Hello world",
      "slug": "hello-world",
      "path": "/posts/hello-world",
      "url": "https://blog.example/posts/hello-world",
      "excerpt": "A friendly first post.",
      "author": { "name": "Sam Rivera" },
      "publishedAt": "2026-10-18T09:00:00.000Z",
      "updatedAt": "2026-10-18T09:05:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 11, "hasMore": false }
}
```

A single entry adds `body` and `seo`:

```json
{
  "data": {
    "…": "summary fields as above",
    "body": { "html": "<h2>Intro</h2><p>…</p>", "json": { "type": "doc", "content": [] } },
    "seo": {
      "title": "Hello world",
      "description": "A friendly first post.",
      "canonicalUrl": "https://blog.example/posts/hello-world",
      "index": true,
      "follow": true,
      "robots": "index, follow",
      "openGraph": { "title": "Hello world", "description": "A friendly first post." },
      "schemaType": "Article"
    }
  }
}
```

- `body.html` is sanitized by Klipt (only allowed tags, safe links), so you can render it directly.
  `body.json` is the same content as structured data if you'd rather render it yourself.
- SEO values already include fallbacks (e.g. the title when no SEO title is set). `url` and
  `canonicalUrl` are `null` until the site has a domain in Klipt.
- `/resolve` for an old URL returns `{ "redirect": { "to": "/posts/new-slug", "statusCode": 301 } }`.

Errors use `{ "error": { "code": "…", "message": "…" } }` with status `400` (bad query), `401`
(missing, invalid or revoked key), `404` or `500`.

Responses are sent with `Cache-Control: private, no-store`. Cache on your side: until Klipt sends
webhooks on publish, refreshing every minute or so is a good default.

## 3. Example: a Next.js blog

```ts
// lib/klipt.ts (server only)
const BASE = process.env.KLIPT_API_URL!; // e.g. https://klipt.example.com/api/v1

export async function klipt<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.KLIPT_API_KEY}` },
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Klipt API ${res.status}`);
  return res.json();
}
```

```tsx
// app/posts/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { klipt } from "@/lib/klipt";

type Entry = { title: string; body: { html: string }; seo: any };
type Resolved = { data?: Entry; redirect?: { to: string } };

async function load(slug: string) {
  const result = await klipt<Resolved>(`/resolve?path=/posts/${encodeURIComponent(slug)}`);
  if (result?.redirect) permanentRedirect(result.redirect.to); // old URL → new URL (301/308)
  if (!result?.data) notFound();
  return result.data;
}

export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { seo } = await load((await params).slug);
  return {
    title: seo.title,
    description: seo.description,
    alternates: seo.canonicalUrl ? { canonical: seo.canonicalUrl } : undefined,
    robots: { index: seo.index, follow: seo.follow },
    openGraph: seo.openGraph,
  };
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const post = await load((await params).slug);
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.body.html }} />
    </article>
  );
}
```

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";
import { klipt } from "@/lib/klipt";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const res = await klipt<{ data: { path: string; lastModified: string }[] }>("/sitemap");
  return (res?.data ?? []).map((item) => ({
    url: `https://blog.example${item.path}`,
    lastModified: item.lastModified,
  }));
}
```

The same calls work from any language or framework (WordPress, Astro, Nuxt, a mobile app); all you
need is an HTTPS request with the `Authorization` header.

## Not yet available

- Webhooks to notify your website when content is published.
- Draft previews on your own website.
- Media/image fields and taxonomies in responses (they arrive with those features).
- Per-key rate limits.
