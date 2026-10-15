import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { SitesBrowser } from "@/components/sites/sites-browser";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getSites } from "@/lib/data/sites";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage() {
  const sites = await getSites();

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
        <SitesBrowser sites={sites} />
      </div>
    </>
  );
}
