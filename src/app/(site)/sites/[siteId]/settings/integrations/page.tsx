import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CircleCheck, KeyRound, Webhook } from "lucide-react";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { ConnectWebsite } from "@/components/settings/connect-website";
import { WebhooksPanel } from "@/components/settings/webhooks-panel";
import { PermissionDenied } from "@/components/permission-denied";
import { NothingYetBar } from "@/components/insights/parts";
import { ProgressBar } from "@/components/visual/progress-bar";
import { StatCard } from "@/components/visual/stat-card";
import { getApiKeys } from "@/lib/data/api-keys";
import { getWebhooks, scheduleWebhookDelivery } from "@/lib/data/webhooks";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Integrations · Settings" };

/** Where this Klipt instance is served from, so the page can show the API address. */
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function IntegrationsPage({
  params,
}: PageProps<"/sites/[siteId]/settings/integrations">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "api_keys.manage")) {
    return (
      <PermissionDenied
        area="Integrations"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const [keys, hooks, origin] = await Promise.all([
    getApiKeys(site.id),
    getWebhooks(site.id),
    requestOrigin(),
  ]);
  scheduleWebhookDelivery(site.id);
  const usedKeys = keys.filter((key) => key.lastUsedAt).length;
  const enabledHooks = hooks.filter((hook) => hook.enabled).length;
  const delivered = hooks.filter((hook) => hook.lastDelivery?.status === "succeeded").length;
  const failing = hooks.filter((hook) => hook.lastDelivery?.status === "failed").length;
  const sent = hooks.filter((hook) => hook.lastDelivery).length;

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-8">
      <ul
        aria-label="Integrations at a glance"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
      >
        <li>
          <StatCard
            label="API keys"
            value={keys.length}
            icon={KeyRound}
            iconTone="accent"
            caption={keys.length === 0 ? "None yet" : `${usedKeys} used by a website`}
            chart={
              keys.length > 0 ? (
                <ProgressBar
                  value={usedKeys}
                  max={keys.length}
                  label="API keys used by a website"
                />
              ) : (
                <NothingYetBar label="No API keys yet" />
              )
            }
          />
        </li>
        <li>
          <StatCard
            label="Webhooks on"
            value={enabledHooks}
            icon={Webhook}
            iconTone="info"
            caption={hooks.length === 0 ? "None yet" : `${enabledHooks} of ${hooks.length}`}
            chart={
              hooks.length > 0 ? (
                <ProgressBar value={enabledHooks} max={hooks.length} label="Webhooks switched on" />
              ) : (
                <NothingYetBar label="No webhooks yet" />
              )
            }
          />
        </li>
        <li className="col-span-2 lg:col-span-1">
          <StatCard
            label="Last delivery succeeded"
            value={delivered}
            icon={CircleCheck}
            iconTone={failing > 0 ? "danger" : sent > 0 ? "success" : "neutral"}
            caption={
              sent === 0
                ? "Nothing sent yet"
                : failing > 0
                  ? `${failing} of ${sent} webhooks failing`
                  : `All ${sent} webhooks delivering`
            }
            chart={
              sent > 0 ? (
                <ProgressBar
                  value={delivered}
                  max={sent}
                  label="Webhooks whose last delivery succeeded"
                  tone={failing > 0 ? "danger" : "success"}
                />
              ) : (
                <NothingYetBar label="Nothing sent yet" />
              )
            }
          />
        </li>
      </ul>
      <ConnectWebsite apiBase={`${origin}/api/v1`} hasKeys={keys.length > 0} />
      <ApiKeysPanel siteId={site.id} keys={keys} />
      <WebhooksPanel siteId={site.id} webhooks={hooks} />
      <p className="text-muted-foreground text-sm">
        Draft previews on your website and URL patterns are under{" "}
        <Link
          href={siteHref(site.id, "settings", "publishing")}
          className="text-primary underline-offset-4 hover:underline"
        >
          Settings › Publishing
        </Link>
        .
      </p>
    </div>
  );
}
