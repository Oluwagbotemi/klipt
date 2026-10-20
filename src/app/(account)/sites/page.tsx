import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { ArchivedSites } from "@/components/sites/archived-sites";
import { SitesBrowser } from "@/components/sites/sites-browser";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getArchivedSites } from "@/lib/data/settings";
import { getSites } from "@/lib/data/sites";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage({ searchParams }: PageProps<"/sites">) {
  const [sites, archived, query] = await Promise.all([
    getSites(),
    getArchivedSites(),
    searchParams,
  ]);
  const notice =
    query.archived === "1"
      ? "Site archived. You can restore it below."
      : query.deleted === "1"
        ? "Site deleted."
        : null;

  return (
    <>
      <PageHeader
        icon={Globe}
        title="Sites"
        description="Every site you own or collaborate on."
        actions={
          <Button asChild>
            <Link href="/sites/new">
              <Plus aria-hidden />
              Create site
            </Link>
          </Button>
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
