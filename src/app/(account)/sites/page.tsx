import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { CreateSiteButton } from "@/components/sites/create-site-button";
import { SitesBrowser } from "@/components/sites/sites-browser";
import { MockDataNotice } from "@/components/mock-data-notice";
import { PageHeader } from "@/components/page-header";
import { getSites, USING_MOCK_DATA } from "@/lib/data/sites";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage() {
  const sites = await getSites();

  return (
    <>
      <PageHeader
        icon={Globe}
        title="Sites"
        description="Every site you own or collaborate on."
        actions={<CreateSiteButton />}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-6">
        {USING_MOCK_DATA && <MockDataNotice className="self-start" />}
        <SitesBrowser sites={sites} />
      </div>
    </>
  );
}
