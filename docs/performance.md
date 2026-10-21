# Measuring your website's speed (Core Web Vitals)

Klipt stores and manages your content, but your own website shows it to visitors.
Klipt can't load your website on its own, so to see how fast it feels to real
people, your website sends Klipt a few numbers after each visit. Klipt turns them
into the charts and tables under **Optimize › Performance**.

These are **field data**: what real visitors experienced on their own phones and
computers. Klipt never shows estimated or lab numbers.

## What gets measured

| Metric                              | What it means                                          | Good           | Poor        |
| ----------------------------------- | ------------------------------------------------------ | -------------- | ----------- |
| **LCP** (Largest Contentful Paint)  | How long until the main content is visible             | 2.5 s or less  | over 4 s    |
| **INP** (Interaction to Next Paint) | How quickly the page reacts to taps, clicks and typing | 200 ms or less | over 500 ms |
| **CLS** (Cumulative Layout Shift)   | How much the page jumps around while loading           | 0.1 or less    | over 0.25   |
| FCP (First Contentful Paint)        | How long until anything appears                        | 1.8 s or less  | over 3 s    |
| TTFB (Time to First Byte)           | How long your server takes to start sending the page   | 800 ms or less | over 1.8 s  |

LCP, INP and CLS are Google's **Core Web Vitals**. Klipt shows the **75th
percentile** (3 in 4 visits were this fast or faster), the same way Google judges
them. The thresholds are Google's; meeting them doesn't guarantee rankings.

## Connect your website

1. **Set your website's address.** In Klipt, open **Settings › Domains** and add your
   domain (for example `myblog.com`). Klipt only accepts measurements sent from
   that domain (with or without `www.`) and from your preview address
   (**Settings › Integrations**), so other websites can't send fake numbers.
2. **Copy the code.** Open **Optimize › Performance**. The page shows your site's
   **reporting key** and ready-made code with the key filled in. Pick **Next.js** or
   **Any website** and click **Copy code**.
3. **Add it to your website** and publish.
4. **Visit your website.** Measurements are sent when a visitor leaves or hides a
   page, so they show up in Klipt about a minute later.

The reporting key is **public**: it's meant to be in browser code and can only send
measurements. It can't read or change your content (that needs a secret API key,
see `docs/content-api.md`). Owners and admins can replace it under
**Connection and code › Replace key**; the old key stops working straight away.

### Next.js (App Router)

Save this as `app/klipt-vitals.tsx` (Klipt shows it with your real address and key):

```tsx
"use client";

import { useReportWebVitals } from "next/web-vitals";

const KLIPT_VITALS_URL = "https://your-klipt-address/api/v1/vitals";
const KLIPT_VITALS_KEY = "kpub_…"; // public reporting key, safe in browser code

let queue = [];
function flush() {
  if (queue.length === 0) return;
  const body = JSON.stringify({ key: KLIPT_VITALS_KEY, events: queue.splice(0, 50) });
  if (!navigator.sendBeacon || !navigator.sendBeacon(KLIPT_VITALS_URL, body)) {
    fetch(KLIPT_VITALS_URL, { method: "POST", body, keepalive: true }).catch(() => {});
  }
}
function report(metric) {
  queue.push({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    path: location.pathname,
    deviceType: matchMedia("(max-width: 767px), (pointer: coarse)").matches ? "mobile" : "desktop",
  });
}

if (typeof window !== "undefined") {
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
}

export function KliptVitals() {
  useReportWebVitals((metric) => {
    if (["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) report(metric);
  });
  return null;
}
```

Then render it once inside `<body>` in `app/layout.tsx`:

```tsx
import { KliptVitals } from "./klipt-vitals";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <KliptVitals />
        {children}
      </body>
    </html>
  );
}
```

### Any other website

Paste this before `</body>` on every page (or in your site builder's "custom code"
setting). It loads Google's [web-vitals](https://github.com/GoogleChrome/web-vitals)
library, version 4.2.4:

```html
<script type="module">
  import { onCLS, onFCP, onINP, onLCP, onTTFB } from "https://unpkg.com/web-vitals@4.2.4?module";

  // …the same KLIPT_VITALS_URL, KLIPT_VITALS_KEY, flush() and report() as above…

  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
  [onCLS, onFCP, onINP, onLCP, onTTFB].forEach((on) => on(report));
</script>
```

## The endpoint

`POST /api/v1/vitals` with a JSON body, sent as plain text (what
`navigator.sendBeacon` does by default, so browsers don't need a CORS preflight;
`application/json` works too):

```json
{
  "key": "kpub_…",
  "events": [
    { "metric": "LCP", "value": 2140, "path": "/posts/hello", "deviceType": "mobile" },
    { "metric": "CLS", "value": 0.04, "path": "/posts/hello", "deviceType": "mobile" }
  ]
}
```

- `metric`: `LCP`, `INP`, `CLS`, `FCP` or `TTFB`. `value`: milliseconds, or the CLS score.
- `path`: the page's path (a full URL also works). Query strings and `#fragments` are
  removed before anything is stored.
- `deviceType` (optional): `mobile` or `desktop`. If it's missing, Klipt guesses from
  the browser's user agent and then discards it.
- `rating`, `navigationType` and `connection` are accepted and ignored.

Responses: `200 {"accepted": n}`; `400` for a malformed body (at most 50 events and
16 KB per request); `401` for an unknown or replaced key; `403` when the request
doesn't come from your website's address; `429` when sending too fast or past the
daily limit (100,000 measurements and 1,000 different pages per site per day; extra
pages are counted together as "other pages").

## Privacy

Klipt adds each measurement to a **daily total** per page, metric and device type
(mobile or desktop), then forgets it. It doesn't store IP addresses, cookies, user
agents, query strings or anything else that could identify a visitor, and the code
sets no cookies. Daily totals are kept for 90 days.

## How the numbers are calculated

Each day's measurements are counted into fixed ranges ("buckets", for example LCP
2.25–2.5 s). The 75th percentile is found by walking the buckets to the one that holds
the 75th-percentile visit and reading the value proportionally within it, so it can be
off by up to one bucket's width (at most 250 ms for LCP around its thresholds,
25 ms for INP, 0.025 for CLS). Google's thresholds are bucket boundaries, so the
good / needs improvement / poor shares are exact. Days are UTC.

## What the other tabs show

- **Core Web Vitals:** each metric's daily trend against the good / poor bands, with a
  data table.
- **Pages:** every measured page, worst first, linked to its entry when the path
  matches a published Klipt page. Pages with fewer than 50 visits are marked
  "Few visits".
- **Assets:** images in the media library over 300 KB or 2,500 px wide, without a known
  size, or without alt text, and where each is used. This works without connecting
  your website.
- **Recommendations:** fixed rules applied to your measurements and media (for example,
  slow pages that use large images). They point to likely causes; your developer can
  confirm them with Lighthouse or PageSpeed Insights.

Who can see it: owners, admins and editors. Owners and admins can replace the
reporting key.
