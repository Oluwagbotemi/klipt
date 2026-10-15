"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Shared body for error.tsx boundaries. */
export function RouteError({
  title = "Something went wrong",
  reset,
}: {
  title?: string;
  reset: () => void;
}) {
  return (
    <div role="alert">
      <EmptyState
        icon={CircleAlert}
        title={title}
        description="This view couldn't be loaded. Your data hasn't changed. Try again, and if it keeps happening, reload the page."
        action={
          <Button onClick={reset}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        }
      />
    </div>
  );
}
