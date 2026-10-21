import { handleVitalsIngest, vitalsPreflight } from "@/lib/data/vitals-ingest";

/** POST /api/v1/vitals: Core Web Vitals from the site's visitors (see docs/performance.md). */
export function POST(request: Request) {
  return handleVitalsIngest(request);
}

export function OPTIONS(request: Request) {
  return vitalsPreflight(request);
}
