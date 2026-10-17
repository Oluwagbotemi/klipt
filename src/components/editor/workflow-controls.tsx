"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, Loader2, Send, Undo2, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkflowAction } from "@/lib/content";

/** Local date-time string for <input type="datetime-local">, `minutes` from now. */
function localInputValue(minutesFromNow: number) {
  const d = new Date(Date.now() + minutesFromNow * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Publish / schedule / unpublish for publishers; submit / withdraw for authors.
 * Publishing is confirmed with a summary of open SEO suggestions, which never
 * block it.
 */
export function WorkflowControls({
  allowed,
  status,
  pending,
  suggestions,
  onAction,
}: {
  allowed: Record<WorkflowAction, boolean>;
  status: string;
  pending: boolean;
  suggestions: string[];
  onAction: (action: WorkflowAction, scheduledAt?: string) => Promise<string | null>;
}) {
  const [dialog, setDialog] = useState<"publish" | "schedule" | null>(null);
  const [when, setWhen] = useState(() => localInputValue(60));
  const [error, setError] = useState<string | null>(null);

  async function run(action: WorkflowAction, scheduledAt?: string) {
    setError(null);
    const failure = await onAction(action, scheduledAt);
    if (failure) setError(failure);
    else setDialog(null);
  }

  const spinner = pending ? <Loader2 className="animate-spin" aria-hidden /> : null;

  if (allowed.submit || allowed.withdraw) {
    return allowed.submit ? (
      <Button onClick={() => run("submit")} disabled={pending}>
        {spinner ?? <Send aria-hidden />}
        Submit for review
      </Button>
    ) : (
      <Button variant="outline" onClick={() => run("withdraw")} disabled={pending}>
        {spinner ?? <Undo2 aria-hidden />}
        Withdraw from review
      </Button>
    );
  }

  const menu = allowed.schedule || allowed.unpublish;
  if (!allowed.publish && !menu) return null;

  return (
    <>
      <div className="flex">
        {allowed.publish ? (
          <Button
            onClick={() => setDialog("publish")}
            disabled={pending}
            className={menu ? "rounded-r-none" : undefined}
          >
            {spinner ?? <Upload aria-hidden />}
            {status === "scheduled" ? "Publish now" : "Publish"}
          </Button>
        ) : (
          <Button variant="outline" disabled className={menu ? "rounded-r-none" : undefined}>
            Published
          </Button>
        )}
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={allowed.publish ? "default" : "outline"}
                size="icon"
                className="rounded-l-none border-l border-l-black/10"
                aria-label="More publishing options"
                disabled={pending}
              >
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {allowed.schedule && (
                <DropdownMenuItem
                  onSelect={() => {
                    setWhen(localInputValue(60));
                    setError(null);
                    setDialog("schedule");
                  }}
                >
                  <CalendarClock aria-hidden />
                  {status === "scheduled" ? "Change schedule…" : "Schedule…"}
                </DropdownMenuItem>
              )}
              {allowed.unpublish && (
                <DropdownMenuItem onSelect={() => run("unpublish")}>
                  <Undo2 aria-hidden />
                  {status === "scheduled" ? "Cancel schedule" : "Unpublish (back to draft)"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={dialog === "publish"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Publish now?</AlertDialogTitle>
          <AlertDialogDescription>
            It will be marked as published. Delivering pages to your live website is a separate step
            that isn&apos;t set up yet.
          </AlertDialogDescription>
          {suggestions.length > 0 && (
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="font-medium">Optional suggestions</p>
              <ul className="text-muted-foreground mt-1 list-disc pl-5">
                {suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void run("publish");
              }}
              disabled={pending}
            >
              {spinner}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "schedule"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Schedule publishing</AlertDialogTitle>
          <AlertDialogDescription>
            Pick when this should be published. Times are in your local time zone.
          </AlertDialogDescription>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="schedule-at" className="text-sm font-medium">
              Publish on
            </label>
            <input
              id="schedule-at"
              type="datetime-local"
              value={when}
              min={localInputValue(2)}
              onChange={(e) => setWhen(e.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "schedule-error" : undefined}
            />
            {error && (
              <p id="schedule-error" className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const date = new Date(when);
                if (!when || Number.isNaN(date.getTime())) {
                  setError("Pick a date and time.");
                  return;
                }
                void run("schedule", date.toISOString());
              }}
              disabled={pending}
            >
              {spinner}
              Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
