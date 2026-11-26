import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { appOrigin, isEmailEnabled } from "@/lib/data/email";
import { getMemberSite, getOnboarding } from "@/lib/data/onboarding";
import { parseStep } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/**
 * The welcome flow for new people: role, what they're building, their first
 * site, then (optional) team and website. People who joined through an
 * invitation (?joined=<siteId>) only answer the role.
 */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="bg-background w-full max-w-[1200px] rounded-[28px] border p-10"
        >
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      }
    >
      <Welcome searchParams={searchParams} />
    </Suspense>
  );
}

async function Welcome({ searchParams }: Pick<PageProps<"/welcome">, "searchParams">) {
  const [query, { state }] = await Promise.all([searchParams, getOnboarding()]);
  const [joined, site] = await Promise.all([
    getMemberSite(query.joined),
    getMemberSite(query.site),
  ]);

  // Done, or not new (they already have sites and aren't mid-flow): nothing to do here.
  if (state.onboardedAt && !joined) redirect(site ? `/sites/${site.id}/overview` : "/sites");
  if (!joined && !site && state.siteCount > 0) redirect("/sites");

  const step = parseStep(query.step, Boolean(joined));
  if ((step === "team" || step === "connect") && !site) redirect("/welcome?step=site");

  return (
    <WelcomeFlow
      step={step}
      role={state.role}
      building={state.building}
      site={site ? { id: site.id, name: site.name, domain: site.domain } : null}
      joined={joined ? { id: joined.id, name: joined.name } : null}
      emailEnabled={isEmailEnabled()}
      apiBase={`${await appOrigin()}/api/v1`}
    />
  );
}
