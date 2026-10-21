"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  previewUrlPatterns,
  PublishingValidationError,
  savePublishingRules,
  saveUrlPatterns,
} from "@/server/publishing";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import type { PatternChange } from "@/lib/publishing";
import { MAX_PATTERN_LENGTH } from "@/lib/url-patterns";

/*
 * Settings › Publishing actions. Owners and admins only (site.update); the
 * server functions re-check that and validate everything again.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to change publishing settings.";

export interface RulesState {
  values: { requireReview: boolean; defaultModelKey: string };
  errors?: { defaultModelKey?: string; form?: string };
  saved?: boolean;
}

export async function savePublishingRulesAction(
  _previous: RulesState,
  formData: FormData,
): Promise<RulesState> {
  const values = {
    requireReview: formData.get("requireReview") === "on",
    defaultModelKey: String(formData.get("defaultModelKey") ?? "").slice(0, 40),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  try {
    const { user } = await requireSitePermission(siteId.data, "site.update");
    await savePublishingRules(await getDb(), user.id, siteId.data, values);
  } catch (error) {
    if (error instanceof PublishingValidationError) {
      return { values, errors: { form: error.message, ...error.errors } };
    }
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
  refresh();
  return { values, saved: true };
}

const patternsInput = z.record(z.string().max(40), z.string().max(MAX_PATTERN_LENGTH + 20));

export type PatternsResult =
  | { ok: true; changes: PatternChange[]; redirects?: number }
  | { ok: false; error: string; errors?: Record<string, string> };

async function patternsCall(
  siteId: string,
  patterns: unknown,
  run: (
    userId: string,
    input: { patterns: Record<string, string> },
  ) => Promise<{ changes: PatternChange[]; redirects?: number }>,
): Promise<PatternsResult> {
  const parsedId = id.safeParse(siteId);
  const parsed = patternsInput.safeParse(patterns);
  if (!parsedId.success || !parsed.success) {
    return { ok: false, error: "Those patterns couldn't be read. Reload and try again." };
  }
  try {
    const { user } = await requireSitePermission(parsedId.data, "site.update");
    return { ok: true, ...(await run(user.id, { patterns: parsed.data })) };
  } catch (error) {
    if (error instanceof PublishingValidationError) {
      return { ok: false, error: error.message, errors: error.errors };
    }
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: NO_PERMISSION };
    }
    throw error;
  }
}

/** What saving would change (which live addresses move), without saving. */
export async function previewUrlPatternsAction(
  siteId: string,
  patterns: Record<string, string>,
): Promise<PatternsResult> {
  return patternsCall(siteId, patterns, async (userId, input) => ({
    changes: await previewUrlPatterns(await getDb(), userId, siteId, input),
  }));
}

/** Saves the patterns, adding a 301 redirect for every live address that moves. */
export async function saveUrlPatternsAction(
  siteId: string,
  patterns: Record<string, string>,
): Promise<PatternsResult> {
  const result = await patternsCall(siteId, patterns, async (userId, input) =>
    saveUrlPatterns(await getDb(), userId, siteId, input),
  );
  if (result.ok) {
    scheduleWebhookDelivery(siteId, { settle: true });
    refresh();
  }
  return result;
}
