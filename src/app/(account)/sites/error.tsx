"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return <RouteError title="Sites couldn't be loaded" reset={reset} />;
}
