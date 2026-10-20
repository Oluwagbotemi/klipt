import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";
import { ConnectWebsite } from "@/components/settings/connect-website";
import { PreviewSettings } from "@/components/settings/preview-settings";
import { WebhooksPanel } from "@/components/settings/webhooks-panel";
import { PermissionDenied } from "@/components/permission-denied";
import { getApiKeys } from "@/lib/data/api-keys";
import { getSitePreviewUrl } from "@/lib/data/previews";
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
  const [keys, hooks, origin, previewUrl] = await Promise.all([
    getApiKeys(site.id),
    getWebhooks(site.id),
    requestOrigin(),
    getSitePreviewUrl(site.id),
  ]);
  scheduleWebhookDelivery(site.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <ConnectWebsite apiBase={`${origin}/api/v1`} hasKeys={keys.length > 0} />
      <ApiKeysPanel siteId={site.id} keys={keys} />
      <WebhooksPanel siteId={site.id} webhooks={hooks} />
      <PreviewSettings siteId={site.id} previewUrl={previewUrl} />
    </div>
  );
}
