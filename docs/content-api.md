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
| `GET /site`                      | Site name, domain, URL, language, timezone and `allowIndexing`          |
| `GET /entries`                   | Published entries, newest first. Query: `type`, `page`, `limit` (≤ 100) |
| `GET /entries/{type}/{slug}`     | One published entry with its body and SEO                               |
| `GET /resolve?path=/posts/hello` | What's at a URL on your site: an entry, a redirect, or 404              |
| `GET /sitemap`                   | `path`, `url` and `lastModified` for every page that belongs in sitemap |
| `GET /redirects`                 | Every redirect: `from`, `to`, `statusCode`                              |
| `GET /preview?token=…`           | An entry's current content, drafts included, for a preview link (§ 5)   |

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
      "updatedAt": "2026-10-18T09:05:00.000Z",
      "fields": {}
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
      "documentTitle": "Hello world | The Blog",
      "openGraph": {
        "title": "Hello world",
        "description": "A friendly first post.",
        "image": { "url": "https://…/share.png", "width": 1200, "height": 630, "alt": "…" }
      },
      "schemaType": "Article"
    }
  }
}
```

- `body.html` is sanitized by Klipt (only allowed tags, safe links), so you can render it directly.
  `body.json` is the same content as structured data if you'd rather render it yourself.
- Images in the body come from the site's media library: `<img src alt width height loading="lazy">`
  with absolute URLs, the image's **current** alt text (fixing it in Media fixes it everywhere) and its
  real size, so pages don't jump while images load. Deleted images are left out.
- `seo.documentTitle` is the title with the site's title template applied (Settings › SEO
  defaults), ready for `<title>`. `seo.openGraph.image` is the site's default sharing image, or
  `null`.
- If the site is hidden from search engines (SEO › Crawling & indexing), every entry comes back with
  `robots: "noindex, nofollow"`, `/sitemap` is empty, and `GET /site` reports `allowIndexing: false`.
- SEO values already include fallbacks (e.g. the title when no SEO title is set). `url` and
  `canonicalUrl` are `null` until the site has a domain in Klipt.
- `/resolve` for an old URL returns `{ "redirect": { "to": "/posts/new-slug", "statusCode": 301 } }`.

### Fields (custom content types)

In **Content models**, owners and admins can create content types such as _Product_ or _Event_ and
give any type (Page and Post too) its own fields. Every entry, in lists and on its own, then carries
a `fields` object with one key per field, in the order they're defined. Empty fields are `null`.

```bash
curl "https://klipt.example.com/api/v1/entries?type=product" \
  -H "Authorization: Bearer $KLIPT_API_KEY"
```

```json
{
  "id": "…",
  "type": "product",
  "title": "Red kettle",
  "slug": "red-kettle",
  "path": "/product/red-kettle",
  "fields": {
    "price": 49,
    "tagline": "Boils in two minutes",
    "launch_date": "2026-11-01",
    "in_stock": true,
    "size": "1.5 litres",
    "photo": {
      "url": "https://klipt.example.com/media/…/kettle.jpg",
      "alt": "A red kettle on a stove",
      "width": 1600,
      "height": 1200
    },
    "review": {
      "id": "…",
      "type": "post",
      "title": "We tested 12 kettles",
      "slug": "kettle-test",
      "path": "/posts/kettle-test"
    }
  }
}
```

| Field type      | In `fields`                                                        |
| --------------- | ------------------------------------------------------------------ |
| Text, Long text | A string                                                           |
| Number          | A number                                                           |
| Date            | `"YYYY-MM-DD"`                                                     |
| Yes / no        | `true` or `false`                                                  |
| Dropdown        | The chosen option's text                                           |
| Image           | `{ url, alt, width, height }` with an absolute URL and current alt |
| Link to content | `{ id, type, title, slug, path }`, or `null` unless it's published |

- A linked entry only appears once it's published, so drafts never leak to your website. Fetch it
  with `GET /entries/{type}/{slug}` if you need more than its title and path.
- Entries of a custom type live at `/{type}/{slug}` (e.g. `/product/red-kettle`), and `/resolve`
  finds them there.
- A field's key never changes. Removing a field stops it appearing in `fields`.

Errors use `{ "error": { "code": "…", "message": "…" } }` with status `400` (bad query), `401`
(missing, invalid or revoked key), `404` or `500`.

Responses are sent with `Cache-Control: private, no-store`. Cache on your side, and use
[webhooks](#4-webhooks) to refresh as soon as something changes.

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
    title: seo.documentTitle,
    description: seo.description,
    alternates: seo.canonicalUrl ? { canonical: seo.canonicalUrl } : undefined,
    robots: { index: seo.index, follow: seo.follow },
    openGraph: {
      ...seo.openGraph,
      images: seo.openGraph.image ? [seo.openGraph.image] : undefined,
    },
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

## 4. Webhooks

Instead of checking Klipt for changes, let Klipt tell your website. In **Settings → Integrations →
Add webhook**, enter an address on your website (it must be `https://` and publicly reachable) and
choose the events.

| Event                | Sent when                                                                |
| -------------------- | ------------------------------------------------------------------------ |
| `entry.published`    | An entry goes live (including scheduled entries when their time comes)   |
| `entry.updated`      | A live entry is edited. Combined: at most one every 30 seconds per entry |
| `entry.unpublished`  | A live entry is unpublished or archived                                  |
| `entry.slug_changed` | A live entry moves to a new URL; `previousPath` holds the old one        |
| `ping`               | You press **Send test event**                                            |

Klipt sends a `POST` with a JSON body:

```json
{
  "id": "6f1c…",
  "event": "entry.slug_changed",
  "createdAt": "2026-10-18T09:05:00.000Z",
  "site": { "id": "…", "name": "Northwind Journal" },
  "data": {
    "entry": {
      "id": "…",
      "type": "post",
      "title": "Hello again",
      "slug": "hello-again",
      "path": "/posts/hello-again",
      "url": "https://blog.example/posts/hello-again"
    },
    "previousPath": "/posts/hello-world",
    "redirectCreated": true
  }
}
```

The message only says _what_ changed. Fetch the current content from the API (or just revalidate
the affected pages) rather than trusting the message body for content.

Headers: `Klipt-Event`, `Klipt-Delivery` (same as `id`; use it to ignore duplicates) and
`Klipt-Signature: t=<unix seconds>,v1=<hex>`. The signature is HMAC-SHA256 of
`<t>.<raw request body>` with the webhook's **signing secret** (on the webhook's page in Klipt).

**Respond with any 2xx status within 10 seconds.** Anything else (or no answer) counts as failed and
is retried up to 6 times over about 15 hours. Klipt doesn't follow redirects. Every attempt, with
your website's response, is listed on the webhook's page, where you can also resend it.

### Example: refresh a Next.js blog

```ts
// app/api/klipt-webhook/route.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const body = await request.text(); // the raw body, before parsing
  const header = request.headers.get("klipt-signature") ?? "";
  const { t, v1 } = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const expected = createHmac("sha256", process.env.KLIPT_WEBHOOK_SECRET!)
    .update(`${t}.${body}`)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // reject replays older than 5 min
  const valid =
    v1?.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  if (!valid || !fresh) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);
  const entry = event.data?.entry;
  if (entry) {
    revalidatePath(entry.path);
    if (event.data.previousPath) revalidatePath(event.data.previousPath);
    if (entry.type === "post") revalidatePath("/posts");
  }
  return Response.json({ ok: true });
}
```

### Timing on Vercel

Klipt sends events right after the change, from the same request. Retries and scheduled entries are
handled whenever Klipt is next in use and by a daily job (`vercel.json`, needs a `CRON_SECRET`
environment variable). On Vercel's Hobby plan that job can only run once a day; a paid plan can run
it more often.

## 5. Draft previews on your website

Editors can see a draft exactly as it will look on your website before publishing.

1. Add a route on your website that turns preview mode on (below), e.g. `/api/preview`.
2. In Klipt, open **Settings › Integrations › Draft previews** and enter its full address, e.g.
   `https://myblog.com/api/preview` (an owner or admin can do this).
3. The editor's **Preview on website** button now opens
   `https://myblog.com/api/preview?token=…&type=post&slug=hello&path=/posts/hello`.

The `token` works for **one hour** and only for that entry. Your website exchanges it, together with
its API key, for the entry's current content:

```bash
curl "https://klipt.example.com/api/v1/preview?token=…" -H "Authorization: Bearer klipt_…"
```

The response looks like `GET /entries/{type}/{slug}` plus `status` (`draft`, `in_review`,
`scheduled` or `published`) and `preview: { expiresAt }`. It is never cached. Errors:

| Status | `code`                  | Meaning                                             |
| ------ | ----------------------- | --------------------------------------------------- |
| 401    | `invalid_preview_token` | The token was changed, cut off or not made by Klipt |
| 401    | `preview_expired`       | Older than an hour; click Preview in Klipt again    |
| 403    | `wrong_site`            | The token belongs to a different site than the key  |
| 404    | `not_found`             | The entry was deleted or archived                   |

### Example: Next.js Draft Mode

```ts
// app/api/preview/route.ts
import { cookies, draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  // Check the token before turning preview mode on.
  const res = await fetch(`${BASE}/preview?token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${process.env.KLIPT_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return new Response("Preview link not valid", { status: 401 });

  (await draftMode()).enable();
  (await cookies()).set("klipt-preview", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 3600,
  });
  // Only follow relative paths so the link can't send visitors to another site.
  const path = searchParams.get("path") ?? "/";
  redirect(path.startsWith("/") && !path.startsWith("//") ? path : "/");
}
```

```ts
// In your page, before loading the published entry:
const { isEnabled } = await draftMode();
const token = (await cookies()).get("klipt-preview")?.value;
if (isEnabled && token) {
  const res = await fetch(`${BASE}/preview?token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${process.env.KLIPT_API_KEY}` },
    cache: "no-store",
  });
  const draft = res.ok ? (await res.json()).data : null;
  // The cookie is for one entry; other pages keep showing published content.
  if (draft?.type === type && draft.slug === slug) return draft;
}
```

To leave preview mode, add a route that calls `(await draftMode()).disable()`.

## Not yet available

- A media endpoint; taxonomies; fields that hold several values (e.g. a list of links).
- Per-key rate limits.
