import { ChevronDown, Globe } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

const ENDPOINTS = [
  { path: "/entries?type=post", does: "Published posts, newest first (20 per page)" },
  { path: "/entries/post/{slug}", does: "One post with its body (HTML) and SEO tags" },
  {
    path: "/resolve?path=/posts/{slug}",
    does: "What's at a URL: an entry, or a redirect to follow",
  },
  { path: "/sitemap", does: "URLs for your sitemap.xml (leaves out noindex pages)" },
  { path: "/redirects", does: "Old URLs and where they now point" },
  { path: "/site", does: "Site name, domain and language" },
];

/** Explains the headless setup: the site's own website fetches content from Klipt. */
export function ConnectWebsite({ apiBase, hasKeys }: { apiBase: string; hasKeys: boolean }) {
  const example = `curl "${apiBase}/entries?type=post" \\\n  -H "Authorization: Bearer $KLIPT_API_KEY"`;

  return (
    <section aria-labelledby="connect-heading" className="visual-card">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="bg-primary-soft text-primary-strong grid size-9 shrink-0 place-items-center rounded-xl"
          >
            <Globe className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="connect-heading" className="text-base font-semibold">
              Connect your website
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Klipt stores and manages your content; your website shows it with its own design. Your
              website asks Klipt for published content through the content API.
            </p>
          </div>
        </div>

        <ol className="text-sm marker:font-medium [&>li]:ml-5 [&>li]:list-decimal [&>li]:pl-1">
          <li className={hasKeys ? "text-muted-foreground" : undefined}>
            Create an API key below.
          </li>
          <li className="mt-1.5">
            Save it on your website&apos;s server as an environment variable, such as{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">KLIPT_API_KEY</code>.
            Keep it out of browser code, where anyone could read it.
          </li>
          <li className="mt-1.5">
            Have your website request content from the address below, sending the key with each
            request.
          </li>
        </ol>

        <div className="flex flex-col gap-1.5">
          <p id="api-base-label" className="text-sm font-medium">
            API address
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              aria-labelledby="api-base-label"
              className="bg-muted min-w-0 flex-1 basis-full rounded-lg px-3 py-2 font-mono text-sm break-all sm:basis-0"
            >
              {apiBase}
            </code>
            <CopyButton value={apiBase} label="Copy address" />
          </div>
        </div>
      </div>

      <details className="group border-card-border border-t">
        <summary className="focus-visible:ring-ring/50 flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium outline-none focus-visible:ring-[3px] sm:px-6 [&::-webkit-details-marker]:hidden">
          What your website can request
          <ChevronDown
            className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6">
          <dl className="divide-card-border divide-y rounded-xl border text-sm">
            {ENDPOINTS.map((endpoint) => (
              <div
                key={endpoint.path}
                className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:gap-4"
              >
                <dt className="font-mono text-xs break-all sm:w-64 sm:shrink-0 sm:pt-0.5">
                  GET {endpoint.path}
                </dt>
                <dd className="text-muted-foreground">{endpoint.does}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-sm">
            Only published content is returned. Each entry includes ready-to-use SEO values (title,
            description, canonical URL and robots) for your page&apos;s <code>&lt;head&gt;</code>.
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Try it from a terminal</p>
              <CopyButton value={example.replace("\\\n  ", "")} label="Copy command" />
            </div>
            <pre className="bg-muted overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-xs">
              {example}
            </pre>
          </div>
        </div>
      </details>
    </section>
  );
}
