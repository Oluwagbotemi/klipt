import Link from "next/link";
import { ArrowLeft, Search, SearchX, Tags } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReadOnlyNote } from "@/components/models/model-form-parts";
import { TermsManager } from "@/components/taxonomy/terms-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSite } from "@/lib/data/sites";
import { getTerms } from "@/lib/data/taxonomy";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { matchesTerm, termPath } from "@/lib/taxonomy";

const INTRO: Record<string, string> = {
  category:
    "Categories group entries by topic and can be nested up to three levels, e.g. Guides › SEO. Each one gets an archive page on your website.",
  tag: "Tags are free-form labels for finding related entries, e.g. “recipes” or “product news”. Each one gets an archive page on your website.",
};

/** Terms of one taxonomy (Categories, Tags or a custom one), with search. */
export async function TermsPage({
  siteId,
  taxonomyKey,
  query,
}: {
  siteId: string;
  taxonomyKey: string;
  query: string;
}) {
  const [site, { taxonomy, terms }] = await Promise.all([
    getSite(siteId),
    getTerms(siteId, taxonomyKey),
  ]);
  const canManage = can(site.currentUserRole, "taxonomy.manage");
  const base = taxonomy.isSystem
    ? siteHref(site.id, "taxonomy", taxonomy.key === "tag" ? "tags" : undefined)
    : `${siteHref(site.id, "taxonomy", "custom")}/${taxonomy.key}`;
  const q = query.trim().toLowerCase();
  const nameLower = taxonomy.name.toLowerCase();

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 px-4 py-6 sm:px-8">
      {!taxonomy.isSystem && (
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={siteHref(site.id, "taxonomy", "custom")}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden /> Custom taxonomies
          </Link>
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
            {taxonomy.name}
            <code className="text-muted-foreground font-mono text-xs font-normal">
              {taxonomy.key}
            </code>
          </h2>
        </div>
      )}
      <p className="text-muted-foreground max-w-prose text-sm">
        {INTRO[taxonomy.key] ??
          (taxonomy.description ||
            `Archive pages live at ${termPath(taxonomy.key, "example")} on your website.`)}
      </p>
      {!canManage && (
        <ReadOnlyNote>
          You can view {nameLower}. Only editors, admins and owners can change them.
          {taxonomy.key === "tag" && can(site.currentUserRole, "content.create")
            ? " You can add new tags while editing your entries."
            : ""}
        </ReadOnlyNote>
      )}
      {terms.length > 0 && (
        <form action={base} role="search" className="relative w-full lg:max-w-xs">
          <label htmlFor="term-search" className="sr-only">
            Search {nameLower}
          </label>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="term-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search names, then press Enter"
            className="pl-9"
            autoComplete="off"
          />
        </form>
      )}
      <TermsManager
        siteId={site.id}
        taxonomy={taxonomy}
        terms={terms}
        query={q}
        canManage={canManage}
        contentHref={siteHref(site.id, "content")}
      />
      {terms.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={`No ${nameLower} yet`}
          description={
            canManage
              ? `Add your first one, then choose ${nameLower} for entries in the editor's “Categories & tags” panel.`
              : `When editors add ${nameLower}, they appear here.`
          }
        />
      ) : (
        q &&
        !terms.some((term) => matchesTerm(term, q)) && (
          <EmptyState
            icon={SearchX}
            title="Nothing matches"
            description={`No ${nameLower} match “${query.trim()}”.`}
            action={
              <Button variant="outline" asChild>
                <Link href={base}>Clear search</Link>
              </Button>
            }
          />
        )
      )}
    </div>
  );
}
