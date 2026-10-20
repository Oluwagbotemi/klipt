import { z } from "zod";
import { createSiteSchema } from "@/lib/validation/site";

/* Site settings: shared validation and option lists (client-safe). */

export const LANGUAGES = [
  ["en", "English"],
  ["en-GB", "English (UK)"],
  ["en-US", "English (US)"],
  ["fr", "French"],
  ["de", "German"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["pl", "Polish"],
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["yo", "Yoruba"],
  ["ha", "Hausa"],
  ["ig", "Igbo"],
  ["sw", "Swahili"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
] as const;

const LANGUAGE_CODES = LANGUAGES.map(([code]) => code) as string[];

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const generalSettingsSchema = z.object({
  name: createSiteSchema.shape.name,
  language: z.string().refine((value) => LANGUAGE_CODES.includes(value), "Choose a language."),
  timezone: z.string().max(64).refine(isTimeZone, "Choose a time zone."),
});

export const domainSchema = z.object({ domain: createSiteSchema.shape.domain });

export const seoDefaultsSchema = z.object({
  titleTemplate: z
    .string()
    .trim()
    .max(120, "Keep the template to 120 characters.")
    .refine((value) => value === "" || value.includes("%s"), {
      message: "Include %s where the page's title should go, e.g. %s | My Blog.",
    })
    .transform((value) => value || undefined),
  ogImageId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => value || undefined),
});

/** "%s | Blog" + "Hello" → "Hello | Blog". Without a template, the title as is. */
export function applyTitleTemplate(template: string | undefined, title: string) {
  return template ? template.replace("%s", title) : title;
}

export const TRANSFER_DAYS = 7;

export interface OwnershipState {
  owner: { id: string; name: string; email: string };
  pending: {
    id: string;
    recipientEmail: string;
    previousOwnerRetainsAdmin: boolean;
    createdAt: string;
    expiresAt: string;
    /** False for links created before Klipt kept them (renew to get one). */
    linkAvailable: boolean;
  } | null;
  history: {
    id: string;
    status: string;
    recipientEmail: string;
    createdAt: string;
    respondedAt: string | null;
  }[];
}
