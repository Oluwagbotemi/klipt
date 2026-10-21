import { z } from "zod";

/*
 * Page-level SEO. Lengths are guidance about how much search engines tend to
 * show, not rules: nothing here blocks saving or publishing.
 */

export const SEO_GUIDANCE = {
  title: { min: 30, max: 60 },
  description: { min: 70, max: 160 },
} as const;

/** Stored per entry in content_entries.seo. Empty values fall back to defaults. */
export const entrySeoSchema = z.object({
  title: z.string().trim().max(200, "Keep the SEO title under 200 characters.").optional(),
  description: z.string().trim().max(500, "Keep the description under 500 characters.").optional(),
  canonicalUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), {
      message: "Enter a full URL starting with https://, or leave it empty.",
    })
    .optional(),
  index: z.boolean().optional(),
  follow: z.boolean().optional(),
  includeInSitemap: z.boolean().optional(),
  ogTitle: z.string().trim().max(200).optional(),
  ogDescription: z.string().trim().max(500).optional(),
});
export type EntrySeoInput = z.output<typeof entrySeoSchema>;

/** Effective values after defaults (index and follow default to on). */
export function resolveSeo(seo: EntrySeoInput, fallbackTitle: string) {
  const index = seo.index ?? true;
  return {
    title: seo.title || fallbackTitle,
    description: seo.description ?? "",
    index,
    follow: seo.follow ?? true,
    includeInSitemap: index && (seo.includeInSitemap ?? true),
    ogTitle: seo.ogTitle || seo.title || fallbackTitle,
    ogDescription: seo.ogDescription || seo.description || "",
  };
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a URL slug.")
  .max(80, "Keep the slug to 80 characters or fewer.")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens, e.g. spring-sale.");

/** "/Posts/Hello/?x=1#top" → "/Posts/Hello". Returns null for anything that isn't a path. */
export function normalizePath(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 2048) return null;
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export const REDIRECT_CODES = { 301: "Permanent (301)", 302: "Temporary (302)" } as const;

export const redirectInputSchema = z.object({
  from: z
    .string()
    .trim()
    .min(1, "Enter the old address, e.g. /old-page.")
    .max(2048)
    .transform((value, ctx) => {
      const path = normalizePath(value.replace(/^https?:\/\/[^/]+/i, ""));
      if (!path) {
        ctx.addIssue({ code: "custom", message: "Use a path on your site that starts with /." });
        return z.NEVER;
      }
      if (path === "/") {
        ctx.addIssue({ code: "custom", message: "The home page can't be redirected here." });
        return z.NEVER;
      }
      return path;
    }),
  to: z
    .string()
    .trim()
    .min(1, "Enter where visitors should go.")
    .max(2048)
    .transform((value, ctx) => {
      if (/^https?:\/\//i.test(value)) {
        try {
          return new URL(value).toString();
        } catch {
          // fall through to the error below
        }
      }
      const path = normalizePath(value);
      if (!path) {
        ctx.addIssue({
          code: "custom",
          message: "Use a path such as /new-page, or a full address starting with https://.",
        });
        return z.NEVER;
      }
      return path;
    }),
  statusCode: z.coerce.number().pipe(z.union([z.literal(301), z.literal(302)])),
});
export type RedirectInput = z.output<typeof redirectInputSchema>;

export interface RedirectRow {
  id: string;
  from: string;
  to: string;
  statusCode: number;
  /** Created automatically when this entry's URL changed. */
  entry: { id: string; title: string } | null;
  createdByName: string | null;
  updatedAt: string;
}
