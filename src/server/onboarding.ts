import { and, count, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { contentModels, siteMembers, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { createModel, saveModelFields } from "@/server/models";
import { savePublishingRules } from "@/server/publishing";
import { getSiteRole } from "@/server/sites";
import {
  buildingSchema,
  isBuilding,
  isRole,
  roleSchema,
  type OnboardingBuilding,
  type OnboardingState,
} from "@/lib/onboarding";

/*
 * The welcome flow: a new person's answers (role, what they're building), the
 * presets the answer applies to their first site, and the "done" flag. Answers
 * only tailor the UI; presets are ordinary content types and settings that can
 * be changed or deleted later.
 */

export async function getOnboardingState(db: DbOrTx, userId: string): Promise<OnboardingState> {
  const [[user], [memberships]] = await Promise.all([
    db
      .select({
        role: users.onboardingRole,
        building: users.onboardingBuilding,
        onboardedAt: users.onboardedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    // Archived sites count too: their owner isn't new to Klipt.
    db.select({ n: count() }).from(siteMembers).where(eq(siteMembers.userId, userId)),
  ]);
  return {
    role: isRole(user?.role) ? user.role : null,
    building: isBuilding(user?.building) ? user.building : null,
    onboardedAt: user?.onboardedAt?.toISOString() ?? null,
    siteCount: Number(memberships?.n ?? 0),
  };
}

export async function saveOnboardingAnswers(
  db: DbOrTx,
  userId: string,
  input: { role?: unknown; building?: unknown },
) {
  const set: { onboardingRole?: string; onboardingBuilding?: string } = {};
  if (input.role !== undefined) set.onboardingRole = roleSchema.parse(input.role);
  if (input.building !== undefined) set.onboardingBuilding = buildingSchema.parse(input.building);
  if (Object.keys(set).length === 0) return;
  await db
    .update(users)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Finished or skipped: the flow never shows again (idempotent; keeps the first time). */
export async function finishOnboarding(db: DbOrTx, userId: string) {
  const [user] = await db
    .select({ onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.onboardedAt) return;
  await db
    .update(users)
    .set({ onboardedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

const PRESET_MODELS = {
  docs: {
    model: {
      name: "Docs",
      key: "docs",
      description: "Guides and help articles.",
      schemaType: "Article",
    },
    fields: [
      {
        key: "summary",
        label: "Summary",
        type: "long_text",
        required: false,
        helpText: "One or two sentences shown in search results and lists.",
      },
    ],
    makeDefault: true,
  },
  store: {
    model: {
      name: "Products",
      key: "products",
      description: "Things you sell.",
      schemaType: "Product",
    },
    fields: [
      { key: "price", label: "Price", type: "number", required: false },
      { key: "image", label: "Image", type: "media", required: false },
    ],
    makeDefault: false,
  },
} as const;

/**
 * Sets up a site for what the person is building. Only the site's owner may
 * apply it, and it never removes anything: Pages and Posts stay.
 */
export async function applyBuildingPreset(
  db: DbOrTx,
  userId: string,
  siteId: string,
  building: OnboardingBuilding,
) {
  const role = await getSiteRole(db, userId, siteId);
  if (role !== "owner") throw new NotAllowedError("Only the site's owner can set it up.");

  if (building === "company") {
    await savePublishingRules(db, userId, siteId, {
      requireReview: false,
      defaultModelKey: "page",
    });
    return;
  }
  if (building !== "docs" && building !== "store") return;

  const preset = PRESET_MODELS[building];
  const [existing] = await db
    .select({ id: contentModels.id })
    .from(contentModels)
    .where(and(eq(contentModels.siteId, siteId), eq(contentModels.key, preset.model.key)))
    .limit(1);
  if (existing) return;

  const { id } = await createModel(db, userId, siteId, preset.model);
  const [model] = await db
    .select({ updatedAt: contentModels.updatedAt })
    .from(contentModels)
    .where(eq(contentModels.id, id))
    .limit(1);
  await saveModelFields(db, userId, siteId, id, {
    fields: preset.fields.map((field) => ({ ...field })),
    expectedUpdatedAt: model.updatedAt.toISOString(),
  });
  if (preset.makeDefault) {
    await savePublishingRules(db, userId, siteId, {
      requireReview: false,
      defaultModelKey: preset.model.key,
    });
  }
}
