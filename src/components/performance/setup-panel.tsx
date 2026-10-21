"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Circle, CircleCheck, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { rotateIngestKeyAction } from "@/app/(site)/sites/[siteId]/performance/actions";
import { CopyButton } from "@/components/copy-button";
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
import { formatDate } from "@/lib/format";
import { nextSnippet, scriptSnippet } from "@/lib/performance-snippets";
import type { PerformanceSetup } from "@/lib/performance";
import { cn } from "@/lib/utils";

type Tab = "next" | "script";

/** How to send Core Web Vitals from the customer's website: steps, reporting key and code. */
export function SetupPanel({
  siteId,
  endpoint,
  setup,
  canManage,
  domainsHref,
  collapsed = false,
}: {
  siteId: string;
  endpoint: string;
  setup: PerformanceSetup;
  canManage: boolean;
  domainsHref: string;
  collapsed?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("next");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const key = setup.ingestKey;
  const code = tab === "next" ? nextSnippet(endpoint, key) : scriptSnippet(endpoint, key);
  const hasOrigin = setup.origins.length > 0;

  function rotate(event: React.MouseEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await rotateIngestKeyAction(siteId);
      if (result.ok) {
        toast.success("New reporting key created. Update the code on your website.");
        setConfirming(false);
      } else toast.error(result.error);
    });
  }

  const steps = [
    {
      done: hasOrigin,
      body: hasOrigin ? (
        <>
          Your website&apos;s address is set. Measurements are accepted from{" "}
          {setup.origins.map((origin, i) => (
            <span key={origin}>
              {i > 0 && (i === setup.origins.length - 1 ? " and " : ", ")}
              <code className="bg-muted rounded px-1 font-mono text-xs break-all">{origin}</code>
            </span>
          ))}
          .
        </>
      ) : (
        <>
          Add your website&apos;s domain in{" "}
          <Link href={domainsHref} className="text-primary underline-offset-4 hover:underline">
            Settings › Domains
          </Link>
          . Klipt only accepts measurements sent from your own website.
        </>
      ),
    },
    {
      done: setup.lastReceivedOn !== null,
      body: "Add the code below to your website and publish it.",
    },
    {
      done: setup.lastReceivedOn !== null,
      body: setup.lastReceivedOn
        ? `Measurements are arriving (last received ${formatDate(setup.lastReceivedOn)}).`
        : "Visit your website. Measurements appear here within a minute of visitors leaving a page.",
    },
  ];

  const content = (
    <div className="flex flex-col gap-5 p-5 pt-0 sm:p-6 sm:pt-0">
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            {step.done ? (
              <CircleCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
              {step.body}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <KeyRound className="text-muted-foreground size-4" aria-hidden />
          Reporting key
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="bg-muted min-w-0 flex-1 basis-56 rounded-lg px-3 py-2 font-mono text-xs break-all"
            data-testid="ingest-key"
          >
            {key}
          </code>
          <CopyButton value={key} label="Copy key" />
          {canManage && (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              <RefreshCw aria-hidden />
              Replace key
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          This key only lets a website send measurements, so it&apos;s safe in browser code. It
          can&apos;t read or change your content. That needs a secret API key.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Website type"
            className="bg-muted inline-flex gap-0.5 rounded-lg p-1"
          >
            {(
              [
                ["next", "Next.js"],
                ["script", "Any website"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls="vitals-snippet"
                onClick={() => setTab(value)}
                className={cn(
                  "focus-visible:ring-ring/50 rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-[3px]",
                  tab === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <CopyButton value={code} label="Copy code" />
        </div>
        <pre
          id="vitals-snippet"
          role="tabpanel"
          tabIndex={0}
          aria-label={tab === "next" ? "Next.js code" : "Code for any website"}
          className="bg-muted focus-visible:ring-ring/50 max-h-80 overflow-auto rounded-lg p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-[3px]"
        >
          {code}
        </pre>
        <p className="text-muted-foreground text-xs">
          {tab === "next"
            ? "Save this as app/klipt-vitals.tsx, then add <KliptVitals /> inside <body> in app/layout.tsx."
            : "Paste this before </body> on every page, or in your site builder's custom code setting."}
        </p>
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Privacy: Klipt keeps only daily totals per page and device type (mobile or desktop). It
          stores no IP addresses, cookies, browser details or query strings, so the data can&apos;t
          identify visitors.
        </span>
      </p>

      <AlertDialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogTitle>Replace the reporting key?</AlertDialogTitle>
          <AlertDialogDescription>
            The current key stops working straight away. Measurements from your website stop
            arriving until you update the code with the new key. Data already collected stays.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep current key</AlertDialogCancel>
            <AlertDialogAction onClick={rotate} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Replace key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <section aria-labelledby="setup-heading" className="bg-card rounded-2xl border">
      {collapsed ? (
        <details>
          <summary className="hover:bg-accent/40 focus-visible:ring-ring/50 cursor-pointer rounded-2xl p-5 outline-none focus-visible:ring-[3px] sm:p-6">
            <span id="setup-heading" className="text-base font-semibold">
              Connection and code
            </span>
            <span className="text-muted-foreground block text-sm">
              Reporting key and the code your website uses to send measurements.
            </span>
          </summary>
          {content}
        </details>
      ) : (
        <>
          <div className="p-5 sm:p-6">
            <h2 id="setup-heading" className="text-base font-semibold">
              Connect your website
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Klipt doesn&apos;t host your website, so it can&apos;t measure it on its own. Your
              website reports how fast real visits were, and Klipt turns that into Core Web Vitals.
            </p>
          </div>
          {content}
        </>
      )}
    </section>
  );
}
