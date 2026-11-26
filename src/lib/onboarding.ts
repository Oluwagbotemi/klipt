import { z } from "zod";

/*
 * The welcome flow (/welcome): answers, presets and steps. Client-safe; the
 * server (src/server/onboarding.ts) re-validates everything.
 */

export const ROLES = {
  writer: { label: "Writer", description: "I write and publish posts and pages." },
  editor: { label: "Editor", description: "I review, edit and schedule other people's work." },
  developer: { label: "Developer", description: "I connect Klipt to a website's code." },
  agency: { label: "Agency or freelancer", description: "I run sites for clients." },
  owner: { label: "Business owner", description: "I look after my own site and team." },
  other: { label: "Something else", description: "None of these quite fits." },
} as const;
export type OnboardingRole = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as OnboardingRole[];

/** What a "building" choice sets up on the first site. Nothing here is irreversible. */
export const BUILDINGS = {
  blog: {
    label: "Blog",
    description: "Articles, news and stories.",
    setsUp: ["New entries start as Posts", "Posts live at /posts/…"],
  },
  company: {
    label: "Company website",
    description: "Pages about your business, plus news.",
    setsUp: ["New entries start as Pages", "Pages live at /…"],
  },
  docs: {
    label: "Docs or help centre",
    description: "Guides and answers for your users.",
    setsUp: ["A “Docs” content type", "Docs live at /docs/…", "New entries start as Docs"],
  },
  store: {
    label: "Online store",
    description: "Products with prices and photos.",
    setsUp: ["A “Products” content type with price and image", "Products live at /products/…"],
  },
  other: {
    label: "Something else",
    description: "Start with pages and posts.",
    setsUp: ["Pages and Posts, ready to use"],
  },
} as const;
export type OnboardingBuilding = keyof typeof BUILDINGS;
export const BUILDING_KEYS = Object.keys(BUILDINGS) as OnboardingBuilding[];

export const roleSchema = z.enum(ROLE_KEYS as [OnboardingRole, ...OnboardingRole[]]);
export const buildingSchema = z.enum(
  BUILDING_KEYS as [OnboardingBuilding, ...OnboardingBuilding[]],
);

export function isRole(value: unknown): value is OnboardingRole {
  return roleSchema.safeParse(value).success;
}
export function isBuilding(value: unknown): value is OnboardingBuilding {
  return buildingSchema.safeParse(value).success;
}

/** The full flow; people who joined through an invitation only answer the role. */
export const STEPS = ["role", "building", "site", "team", "connect"] as const;
export type OnboardingStep = (typeof STEPS)[number];

export function stepsFor(joined: boolean): readonly OnboardingStep[] {
  return joined ? ["role"] : STEPS;
}

export function parseStep(value: unknown, joined: boolean): OnboardingStep {
  const steps = stepsFor(joined);
  return steps.includes(value as OnboardingStep) ? (value as OnboardingStep) : steps[0];
}

export interface OnboardingState {
  role: OnboardingRole | null;
  building: OnboardingBuilding | null;
  onboardedAt: string | null;
  siteCount: number;
}

/** Shows the welcome flow only to new people: not finished or skipped, and no sites yet. */
export function needsOnboarding(state: Pick<OnboardingState, "onboardedAt" | "siteCount">) {
  return state.onboardedAt === null && state.siteCount === 0;
}

/**
 * Overview quick actions, ordered by role (display only): developers see
 * "Connect website" first, everyone else starts with writing.
 */
export type QuickAction = "post" | "page" | "media" | "connect";
export function quickActionOrder(role: OnboardingRole | null): QuickAction[] {
  if (role === "developer") return ["connect", "post", "page", "media"];
  if (role === "agency" || role === "owner") return ["page", "post", "media", "connect"];
  return ["post", "page", "media", "connect"];
}
