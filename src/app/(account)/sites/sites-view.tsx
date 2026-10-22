import { Globe, Plus } from "lucide-react";
import { ArchivedSites } from "@/components/sites/archived-sites";
import { CreateSiteButton } from "@/components/sites/create-site-dialog";
import { SitesBrowser } from "@/components/sites/sites-browser";
import { PageHeader } from "@/components/page-header";
import { getArchivedSites } from "@/lib/data/settings";
import { getSites } from "@/lib/data/sites";

/** The Sites list, shared by /sites and /sites/new (which opens Create site over it). */
export async function SitesView({ notice }: { notice?: string | null }) {
  const [sites, archived] = await Promise.all([getSites(), getArchivedSites()]);

  return (
    <>
      <PageHeader
        icon={Globe}
        title="Sites"
        description="Every site you own or collaborate on."
        actions={
          <CreateSiteButton>
            <Plus aria-hidden />
            Create site
          </CreateSiteButton>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-6">
        {notice && (
          <p role="status" className="bg-success-soft text-success rounded-xl px-4 py-3 text-sm">
            {notice}
          </p>
        )}
        <SitesBrowser sites={sites} />
        <ArchivedSites sites={archived} />
      </div>
    </>
  );
}
