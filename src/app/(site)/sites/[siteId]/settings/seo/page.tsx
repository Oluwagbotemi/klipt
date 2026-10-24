import type { Metadata } from "next";
import Link from "next/link";
import { PermissionDenied } from "@/components/permission-denied";
import { SearchCheck } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";
import { SeoDefaultsForm } from "@/components/settings/settings-forms";
import { getSiteSettings } from "@/lib/data/settings";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "SEO defaults · Settings" };

export default async function SeoDefaultsPage({
  params,
}: PageProps<"/sites/[siteId]/settings/seo">) {
  const { siteId } = await params;
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "site.update")) {
    return (
      <PermissionDenied
        area="SEO defaults"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const settings = await getSiteSettings(site.id);

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <SettingsCard
        icon={SearchCheck}
        title="SEO defaults"
        description="Used for every page, unless the page sets its own. Your website reads them from the content API."
      >
        <SeoDefaultsForm
          siteId={site.id}
          siteName={site.name}
          titleTemplate={settings.seoDefaults.titleTemplate}
          ogImage={settings.seoDefaults.ogImage}
          canUpload={can(site.currentUserRole, "media.upload")}
        />
      </SettingsCard>
      <p className="text-muted-foreground text-sm">
        Search visibility for the whole site is under{" "}
        <Link
          href={siteHref(site.id, "seo", "indexing")}
          className="text-primary underline-offset-4 hover:underline"
        >
          SEO › Crawling &amp; indexing
        </Link>
        .
      </p>
    </div>
  );
}
