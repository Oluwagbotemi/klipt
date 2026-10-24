import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { PreviewSettings } from "@/components/settings/preview-settings";
import {
  LiveAddress,
  PublishingRulesForm,
  UrlPatternsForm,
} from "@/components/settings/publishing-settings";
import { Layers, Link2, Workflow } from "lucide-react";
import { IconTile } from "@/components/visual/card";
import { SettingsCard } from "@/components/settings/settings-card";
import { getPublishingSettings } from "@/lib/data/publishing";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Publishing · Settings" };

export default async function PublishingPage({
  params,
}: PageProps<"/sites/[siteId]/settings/publishing">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.update")) {
    return (
      <PermissionDenied
        area="Publishing"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const settings = await getPublishingSettings(site.id);

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <SettingsCard
        icon={Workflow}
        title="Workflow"
        description="How entries get from draft to live on this site."
      >
        <PublishingRulesForm siteId={site.id} settings={settings} />
      </SettingsCard>

      <SettingsCard
        icon={Link2}
        title="URL patterns"
        description="The address of every entry on your website. The content API, sitemap, menus, SEO checks and the editor all use these."
      >
        <UrlPatternsForm siteId={site.id} settings={settings} />
      </SettingsCard>

      <section aria-labelledby="environments-heading" className="flex flex-col gap-4">
        <div className="flex items-start gap-3 px-1 pt-2">
          <IconTile icon={Layers} tone="neutral" />
          <div>
            <h2 id="environments-heading" className="text-base font-semibold">
              Environments
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Your live website, and the route on it that shows drafts before they&apos;re
              published.
            </p>
          </div>
        </div>
        <div className="visual-card p-5 sm:p-6">
          <LiveAddress siteId={site.id} domain={settings.domain} />
        </div>
        <PreviewSettings siteId={site.id} previewUrl={settings.previewUrl} />
      </section>
    </div>
  );
}
