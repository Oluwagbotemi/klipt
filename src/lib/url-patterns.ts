import { SLUG_PATTERN } from "@/lib/seo";

/*
 * Per-site URL patterns (Settings › Publishing). Each content type has a path
 * pattern such as "/posts/{slug}" or "/blog/{yyyy}/{mm}/{slug}". Every public
 * path Klipt shows or returns is built here, from the site's PathRules, so the
 * editor, SEO checks, menus, webhooks and the content API always agree.
 * Client-safe: no database access.
 */

export type UrlPatterns = Record<string, string>;

/** A site's URL patterns plus the time zone used for {yyyy} and {mm}. */
export interface PathRules {
  patterns: UrlPatterns;
  timeZone: string;
}

/** Built-in rules: pages at /slug, posts at /posts/slug, other types at /key/slug. */
export const DEFAULT_PATH_RULES: PathRules = { patterns: {}, timeZone: "UTC" };

export const URL_TOKENS = ["slug", "yyyy", "mm"] as const;
export type UrlToken = (typeof URL_TOKENS)[number];

export const MAX_PATTERN_LENGTH = 100;
const MAX_SEGMENTS = 6;
const LITERAL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** First segments that would collide with a website's own API routes. */
const RESERVED_FIRST_SEGMENTS = new Set(["api"]);

const TOKEN_TEST: Record<UrlToken, RegExp> = {
  slug: SLUG_PATTERN,
  yyyy: /^\d{4}$/,
  mm: /^(0[1-9]|1[0-2])$/,
};

export function defaultPattern(modelKey: string): string {
  if (modelKey === "page") return "/{slug}";
  if (modelKey === "post") return "/posts/{slug}";
  return `/${modelKey}/{slug}`;
}

export function patternFor(rules: PathRules, modelKey: string): string {
  return rules.patterns[modelKey] ?? defaultPattern(modelKey);
}

export function usesDate(pattern: string): boolean {
  return pattern.includes("{yyyy}") || pattern.includes("{mm}");
}

/** The date an entry's {yyyy}/{mm} come from: first published, else scheduled, else today. */
export function entryDate(entry: {
  publishedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
}): Date | string | null {
  return entry.publishedAt ?? entry.scheduledAt ?? null;
}

function datePartsIn(date: Date, timeZone: string) {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit" })
      .formatToParts(date)
      .reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
  let parts: Record<string, string>;
  try {
    parts = format(timeZone);
  } catch {
    parts = format("UTC");
  }
  return { yyyy: parts.year, mm: parts.month };
}

/** Fills a pattern in. Date tokens use `date` (or now) in the rules' time zone. */
export function buildPath(
  pattern: string,
  slug: string,
  date: Date | string | null = null,
  timeZone = "UTC",
): string {
  let parts: { yyyy: string; mm: string } | null = null;
  return pattern.replace(/\{(slug|yyyy|mm)\}/g, (_match, token: UrlToken) => {
    if (token === "slug") return slug;
    parts ??= datePartsIn(date ? new Date(date) : new Date(), timeZone);
    return parts[token];
  });
}

/**
 * Public path of an entry under the site's rules. `date` matters only for
 * patterns with {yyyy}/{mm}; pass entryDate(entry).
 */
export function entryPath(
  rules: PathRules,
  modelKey: string,
  slug: string,
  date: Date | string | null = null,
): string {
  return buildPath(patternFor(rules, modelKey), slug, date, rules.timeZone);
}

type Segment = { literal: string } | { token: UrlToken };

/** Splits a pattern into segments, or explains what's wrong with it. */
export function parsePattern(input: string): { segments: Segment[] } | { error: string } {
  const pattern = input.trim();
  if (!pattern.startsWith("/")) return { error: "Start the pattern with /, e.g. /blog/{slug}." };
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `Keep the pattern to ${MAX_PATTERN_LENGTH} characters or fewer.` };
  }
  const raw = pattern.slice(1).split("/");
  if (raw.some((part) => part === "")) {
    return { error: "Remove the empty part (two slashes in a row, or a slash at the end)." };
  }
  if (raw.length > MAX_SEGMENTS) return { error: `Use at most ${MAX_SEGMENTS} parts.` };

  const segments: Segment[] = [];
  const seen = new Set<UrlToken>();
  for (const part of raw) {
    const token = /^\{([a-z]+)\}$/.exec(part)?.[1];
    if (token !== undefined) {
      if (!(URL_TOKENS as readonly string[]).includes(token)) {
        return { error: `{${token}} isn't available. Use {slug}, {yyyy} or {mm}.` };
      }
      if (seen.has(token as UrlToken)) return { error: `Use {${token}} only once.` };
      seen.add(token as UrlToken);
      segments.push({ token: token as UrlToken });
    } else if (part.includes("{") || part.includes("}")) {
      return { error: "Put each {placeholder} in its own part, e.g. /blog/{yyyy}/{slug}." };
    } else if (!LITERAL.test(part)) {
      return {
        error: `“${part}” can only use lowercase letters, numbers and single hyphens.`,
      };
    } else {
      segments.push({ literal: part });
    }
  }
  const last = segments.at(-1);
  if (!seen.has("slug")) return { error: "Include {slug}, the entry's URL slug." };
  if (!last || !("token" in last) || last.token !== "slug") {
    return { error: "End the pattern with {slug}, e.g. /blog/{yyyy}/{slug}." };
  }
  const yearAt = segments.findIndex((s) => "token" in s && s.token === "yyyy");
  const monthAt = segments.findIndex((s) => "token" in s && s.token === "mm");
  if (monthAt !== -1 && (yearAt === -1 || yearAt > monthAt)) {
    return { error: "Put {yyyy} before {mm}, e.g. /blog/{yyyy}/{mm}/{slug}." };
  }
  const first = segments[0];
  if ("literal" in first && RESERVED_FIRST_SEGMENTS.has(first.literal)) {
    return { error: `Addresses starting with /${first.literal} are kept for your website's code.` };
  }
  return { segments };
}

export function normalizePattern(input: string): string {
  return input.trim();
}

function segmentsOverlap(a: Segment, b: Segment): boolean {
  if ("literal" in a && "literal" in b) return a.literal === b.literal;
  if ("literal" in a) return TOKEN_TEST[(b as { token: UrlToken }).token].test(a.literal);
  if ("literal" in b) return TOKEN_TEST[a.token].test(b.literal);
  // A slug can be "2024" or "05"; a year can never be a month.
  if (a.token === "slug" || b.token === "slug") return true;
  return a.token === b.token;
}

/** Whether some path could match both patterns (so Klipt couldn't tell them apart). */
export function patternsOverlap(a: string, b: string): boolean {
  const pa = parsePattern(a);
  const pb = parsePattern(b);
  if ("error" in pa || "error" in pb) return false;
  if (pa.segments.length !== pb.segments.length) return false;
  return pa.segments.every((segment, i) => segmentsOverlap(segment, pb.segments[i]));
}

export interface PatternOwner {
  /** Model key, or taxonomy key for term archives. */
  key: string;
  /** Display name, e.g. "Posts" or "Category archives". */
  label: string;
  pattern: string;
}

/**
 * Checks the patterns of every content type (and the fixed term archive
 * addresses, /category/{slug} …) for errors and overlaps. Returns an error per
 * model key; an empty object means all good.
 */
export function validatePatterns(
  models: PatternOwner[],
  fixed: PatternOwner[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const model of models) {
    const parsed = parsePattern(model.pattern);
    if ("error" in parsed) errors[model.key] = parsed.error;
  }
  const invalid = new Set(Object.keys(errors));
  for (const [i, model] of models.entries()) {
    if (invalid.has(model.key)) continue;
    const others = [...models.slice(0, i), ...models.slice(i + 1), ...fixed];
    const clash = others.find(
      (other) => !invalid.has(other.key) && patternsOverlap(model.pattern, other.pattern),
    );
    if (clash) {
      errors[model.key] =
        `Addresses would overlap with ${clash.label} (${clash.pattern}). Add a different first part, e.g. /${model.key}/{slug}.`;
    }
  }
  return errors;
}

/** Term archives use fixed addresses: /<taxonomy key>/{slug}. */
export function termArchivePattern(taxonomyKey: string): string {
  return `/${taxonomyKey}/{slug}`;
}

export interface PathMatch {
  modelKey: string;
  slug: string;
}

/** Content types whose pattern could produce `path`, with the slug it contains. */
export function matchPath(rules: PathRules, modelKeys: string[], path: string): PathMatch[] {
  const parts = path.split("/").filter(Boolean);
  const out: PathMatch[] = [];
  for (const modelKey of modelKeys) {
    const parsed = parsePattern(patternFor(rules, modelKey));
    if ("error" in parsed || parsed.segments.length !== parts.length) continue;
    let slug = "";
    let ok = true;
    for (const [i, segment] of parsed.segments.entries()) {
      if ("literal" in segment) ok = segment.literal === parts[i];
      else ok = TOKEN_TEST[segment.token].test(parts[i]);
      if (!ok) break;
      if ("token" in segment && segment.token === "slug") slug = parts[i];
    }
    if (ok && slug) out.push({ modelKey, slug });
  }
  return out;
}

/** "/blog/{yyyy}/{slug}" → "/blog/2025/my-first-post", for previews in forms. */
export function examplePath(pattern: string, timeZone = "UTC"): string {
  return buildPath(pattern, "my-first-post", new Date(), timeZone);
}
