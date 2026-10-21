/*
 * Copy-paste code for the customer's website: reports Core Web Vitals to
 * POST /api/v1/vitals. Bodies are sent as text (sendBeacon's default), which
 * needs no CORS preflight. Shown in Performance › Overview and docs/performance.md.
 */

export const WEB_VITALS_VERSION = "4.2.4";

const sender = (endpoint: string, key: string) => `const KLIPT_VITALS_URL = "${endpoint}";
const KLIPT_VITALS_KEY = "${key}"; // public reporting key, safe in browser code

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
}`;

export function nextSnippet(endpoint: string, key: string) {
  return `// app/klipt-vitals.tsx — then render <KliptVitals /> once in app/layout.tsx
"use client";

import { useReportWebVitals } from "next/web-vitals";

${sender(endpoint, key)}

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
}`;
}

export function scriptSnippet(endpoint: string, key: string) {
  return `<!-- Before </body> on every page -->
<script type="module">
  import { onCLS, onFCP, onINP, onLCP, onTTFB } from "https://unpkg.com/web-vitals@${WEB_VITALS_VERSION}?module";

  ${sender(endpoint, key).split("\n").join("\n  ")}

  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
  [onCLS, onFCP, onINP, onLCP, onTTFB].forEach((on) => on(report));
</script>`;
}
