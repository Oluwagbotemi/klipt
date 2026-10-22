import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { PreviewSettings } from "@/components/settings/preview-settings";
import {
  LiveAddress,
  PublishingRulesForm,
  UrlPatternsForm,
} from "@/components/settings/publishing-settings";
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SettingsCard title="Workflow" description="How entries get from draft to live on this site.">
        <PublishingRulesForm siteId={site.id} settings={settings} />
      </SettingsCard>

      <SettingsCard
        title="URL patterns"
        description="The address of every entry on your website. The content API, sitemap, menus, SEO checks and the editor all use these."
      >
        <UrlPatternsForm siteId={site.id} settings={settings} />
      </SettingsCard>

      <section aria-labelledby="environments-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="environments-heading" className="text-base font-semibold">
            Environments
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Your live website, and the route on it that shows drafts before they&apos;re published.
          </p>
        </div>
        <div className="bg-card rounded-2xl border p-5 sm:p-6">
          <LiveAddress siteId={site.id} domain={settings.domain} />
        </div>
        <PreviewSettings siteId={site.id} previewUrl={settings.previewUrl} />
      </section>
    </div>
  );
}
