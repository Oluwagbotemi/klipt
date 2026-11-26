import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  BuildingScene,
  ConnectScene,
  KeyScene,
  PeopleScene,
  PublishScene,
  RoleScene,
  SiteScene,
} from "@/components/onboarding/scenes";
import { isBuilding, isRole } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Scenes", robots: { index: false } };

/**
 * Local only: one sign-in/welcome illustration at the card panel's size, so the
 * Stageshow film check can record the welcome scenes without signing in.
 * /dev/scenes?scene=building&building=store
 */
export default function DevScenesPage({ searchParams }: PageProps<"/dev/scenes">) {
  return (
    <main id="main" className="bg-shell grid min-h-dvh place-items-center p-6">
      <Suspense>
        <Scene searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Scene({ searchParams }: Pick<PageProps<"/dev/scenes">, "searchParams">) {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const allowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_SCENES === "1";
  if (!local || !allowed) notFound();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const role = one(query.role);
  const building = one(query.building);
  const scenes: Record<string, React.ReactNode> = {
    publish: <PublishScene />,
    key: <KeyScene />,
    people: <PeopleScene />,
    transfer: <PeopleScene variant="transfer" />,
    role: <RoleScene role={isRole(role) ? role : null} />,
    building: <BuildingScene building={isBuilding(building) ? building : null} />,
    site: <SiteScene name={one(query.name) ?? "Acme Docs"} domain={one(query.domain) ?? ""} />,
    connect: <ConnectScene />,
  };
  const scene = scenes[one(query.scene) ?? "publish"];
  if (!scene) notFound();
  return (
    <div className="bg-card-nested relative flex h-[736px] w-[546px] items-center overflow-hidden rounded-[22px]">
      {scene}
    </div>
  );
}
