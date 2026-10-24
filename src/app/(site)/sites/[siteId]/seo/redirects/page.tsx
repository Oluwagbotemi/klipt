import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyCard } from "@/components/insights/parts";
import { PermissionDenied } from "@/components/permission-denied";
import { RedirectsManager } from "@/components/seo/redirects-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRedirects } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Redirects · SEO" };

export default async function RedirectsPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/seo/redirects">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "seo.manage")) {
    return (
      <PermissionDenied area="Redirects" role={site.currentUserRole} backHref={siteHref(site.id)} />
    );
  }
  const q = typeof query.q === "string" ? query.q.slice(0, 200) : "";
  const prefill = typeof query.new === "string" ? query.new.slice(0, 2048) : null;
  const redirects = await getRedirects(site.id, q);
  const base = siteHref(site.id, "seo", "redirects");

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <p className="text-muted-foreground max-w-prose text-sm">
        When a page moves, a redirect sends visitors and search engines from the old address to the
        new one, so links keep working and rankings carry over. Klipt adds one automatically when
        you change a published page&apos;s URL, and keeps every redirect a single hop.
      </p>
      <form action={base} role="search" className="relative w-full lg:max-w-xs">
        <label htmlFor="redirect-search" className="sr-only">
          Search redirects
        </label>
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="redirect-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search addresses, then press Enter"
          className="rounded-full pl-9"
          autoComplete="off"
        />
      </form>
      <RedirectsManager siteId={site.id} redirects={redirects} canManage prefillFrom={prefill} />
      {redirects.length === 0 &&
        (q ? (
          <EmptyCard
            scene="content"
            title="No matching redirects"
            description={`Nothing matches “${q}”.`}
            action={
              <Button variant="soft" asChild>
                <Link href={base}>Clear search</Link>
              </Button>
            }
          />
        ) : (
          <EmptyCard
            scene="connect"
            title="No redirects yet"
            description="Redirects appear here when you change a published page's URL, or when you add one."
          />
        ))}
    </div>
  );
}
