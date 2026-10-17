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

/**
 * Public path of an entry. Default URL pattern until per-site URL patterns
 * exist: pages at /slug, posts at /posts/slug, other models at /model/slug.
 */
export function entryPath(modelKey: string, slug: string): string {
  if (modelKey === "page") return `/${slug}`;
  if (modelKey === "post") return `/posts/${slug}`;
  return `/${modelKey}/${slug}`;
}
