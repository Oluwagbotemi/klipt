import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { Globe, Server } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";
import { DomainForm } from "@/components/settings/settings-forms";
import { getSiteSettings } from "@/lib/data/settings";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Domains · Settings" };

export default async function DomainsPage({
  params,
}: PageProps<"/sites/[siteId]/settings/domains">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.update")) {
    return (
      <PermissionDenied area="Domains" role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }
  const settings = await getSiteSettings(site.id);

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-4">
        <SettingsCard
          icon={Globe}
          title="Your website's address"
          description="The address where your website shows this site's content. Klipt uses it to build full page URLs, canonical URLs and the sitemap."
        >
          <DomainForm siteId={site.id} domain={settings.domain} />
        </SettingsCard>
        <SettingsCard title="Where DNS is set up" icon={Server}>
          <p className="text-muted-foreground text-sm">
            Klipt doesn&apos;t host your website, so there are no DNS records to add here. Point
            your domain at wherever your website is hosted (for example Vercel or Netlify) using
            that service&apos;s instructions.
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            Changing the address updates URLs in the content API straight away. If you&apos;re
            moving an existing website to a new domain, set up redirects from the old domain on your
            hosting provider so links and search rankings carry over.
          </p>
        </SettingsCard>
      </div>
    </div>
  );
}
