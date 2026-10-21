import { z } from "zod";
import { formatDue } from "@/lib/assignments";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Team › Activity: what kinds of events exist, who may see which, and how an
 * event reads as a sentence. Shared by server and client; the server decides
 * what each member receives (src/server/activity.ts).
 */

export const ACTIVITY_KINDS = {
  content: "Content",
  media: "Media",
  structure: "Structure",
  team: "Team",
  settings: "Settings & SEO",
  integrations: "Integrations",
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;

/** Action prefixes ("content.published" → "content") per kind. */
export const KIND_PREFIXES: Record<ActivityKind, string[]> = {
  content: ["content"],
  media: ["media"],
  structure: ["model", "taxonomy", "term", "menu"],
  team: ["member", "ownership"],
  settings: ["site", "seo", "redirect", "previews"],
  integrations: ["api_key", "webhook", "performance"],
};

export function kindOf(action: string): ActivityKind | null {
  const prefix = action.split(".")[0];
  for (const [kind, prefixes] of Object.entries(KIND_PREFIXES)) {
    if (prefixes.includes(prefix)) return kind as ActivityKind;
  }
  return null;
}

/**
 * Kinds a role may see: owners and admins see everything; editors see the
 * work on content, media and structure; others see none.
 */
export function visibleKinds(role: SiteRole): ActivityKind[] {
  if (can(role, "activity.view_all")) return Object.keys(ACTIVITY_KINDS) as ActivityKind[];
  if (can(role, "activity.view")) return ["content", "media", "structure"];
  return [];
}

export const ACTIVITY_PAGE_SIZE = 50;

/** Activity is kept for a year; the daily job removes older rows. */
export const ACTIVITY_RETENTION_DAYS = 365;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(value)))
  .catch("");

/** Filters from the URL. Invalid values fall back to "no filter". */
export const activityParams = z.object({
  person: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .catch(""),
  kind: z
    .enum(Object.keys(ACTIVITY_KINDS) as [ActivityKind, ...ActivityKind[]])
    .or(z.literal(""))
    .catch(""),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type ActivityParams = z.output<typeof activityParams>;

export function parseActivityParams(
  searchParams: Record<string, string | string[] | undefined>,
): ActivityParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return activityParams.parse({
    person: first(searchParams.person) ?? "",
    kind: first(searchParams.kind) ?? "",
    from: first(searchParams.from) ?? "",
    to: first(searchParams.to) ?? "",
    page: first(searchParams.page) ?? 1,
  });
}

export interface ActivityItem {
  id: string;
  action: string;
  kind: ActivityKind;
  actorId: string | null;
  actorName: string;
  /** False when the actor's account was deleted. */
  actorActive: boolean;
  /** Plain-language description, split so the target can be a link. */
  verb: string;
  target: string | null;
  detail: string | null;
  /** Where the target can be seen, if it still exists. */
  href: string | null;
  createdAt: string;
  /** Calendar day in the site's time zone, "YYYY-MM-DD", for grouping. */
  day: string;
}

export interface ActivityFeed {
  items: ActivityItem[];
  page: number;
  hasMore: boolean;
  kinds: ActivityKind[];
  /** Members and former actors, for the person filter. */
  people: { id: string; name: string }[];
  timezone: string;
}

type Meta = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

/** System taxonomies by their plural name; custom ones by their key. */
const taxonomyName = (key: unknown) =>
  key === "category" ? "Categories" : key === "tag" ? "Tags" : String(key);

const ROLE_WORDS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  author: "Author",
  viewer: "Viewer",
};

/**
 * How an event reads: "{actor} {verb} “{target}” {detail}". Unknown actions
 * still produce a readable sentence from their name.
 */
export function describeActivity(
  action: string,
  meta: Meta,
): { verb: string; target: string | null; detail: string | null } {
  const title = str(meta.title) ?? (meta.title === "" ? "Untitled" : null);
  const name = str(meta.name);
  const say = (verb: string, target: string | null = null, detail: string | null = null) => ({
    verb,
    target,
    detail,
  });
  switch (action) {
    case "content.created":
      return say("created", title ?? "Untitled");
    case "content.updated":
      return say("edited", title ?? "Untitled");
    case "content.published":
      return say(meta.from === "in_review" ? "approved and published" : "published", title);
    case "content.scheduled":
      return say("scheduled", title, meta.scheduledAt ? "for publishing" : null);
    case "content.unpublished":
      return say(meta.from === "scheduled" ? "cancelled the schedule for" : "unpublished", title);
    case "content.submitted_for_review":
      return say("requested a review of", title);
    case "content.withdrawn_from_review":
      return say("withdrew from review", title);
    case "content.changes_requested":
      return say("requested changes to", title, str(meta.note) ? `: “${meta.note}”` : null);
    case "content.archived":
      return say("archived", title);
    case "content.restored":
      return say("restored", title, "as a draft");
    case "content.deleted":
      return say("permanently deleted", title);
    case "content.slug_changed":
      return say(
        "changed the URL of",
        title ?? str(meta.from),
        str(meta.to) ? `to ${meta.to}${meta.redirect ? " (with a redirect)" : ""}` : null,
      );
    case "content.assigned":
      return meta.assigneeId && meta.assigneeId === meta.actorId
        ? say("took on", title)
        : say("assigned", title, str(meta.assigneeName) ? `to ${meta.assigneeName}` : null);
    case "content.unassigned":
      return say("unassigned", title, str(meta.previousName) ? `(was ${meta.previousName})` : null);
    case "content.due_changed":
      return say(
        meta.dueOn ? "set a due date on" : "removed the due date from",
        title,
        str(meta.dueOn) ? `: ${formatDue(meta.dueOn as string)}` : null,
      );
    case "media.uploaded":
      return say("uploaded", str(meta.filename));
    case "media.deleted":
      return say("deleted", str(meta.filename), "from the media library");
    case "model.created":
      return say("created the content type", name);
    case "model.updated":
      return say("changed the content type", name ?? str(meta.key));
    case "model.fields_updated":
      return say("changed the fields of", name ?? str(meta.key));
    case "model.deleted":
      return say("deleted the content type", name);
    case "taxonomy.created":
      return say("created the taxonomy", name);
    case "taxonomy.updated":
      return say("changed the taxonomy", name);
    case "taxonomy.deleted":
      return say("deleted the taxonomy", name);
    case "term.created":
      return say(
        "added the term",
        name,
        str(meta.taxonomy) ? `to ${taxonomyName(meta.taxonomy)}` : null,
      );
    case "term.updated":
      return say("changed the term", name);
    case "term.deleted":
      return say("deleted the term", name);
    case "menu.created":
      return say("created the menu", name ?? str(meta.key));
    case "menu.saved":
      return say("updated the menu", name ?? str(meta.key));
    case "menu.deleted":
      return say("deleted the menu", name ?? str(meta.key));
    case "member.invited":
      return say(
        "invited",
        str(meta.email),
        str(meta.role) ? `as ${ROLE_WORDS[meta.role as string] ?? meta.role}` : null,
      );
    case "member.invite_renewed":
      return say("made a new invitation link for", str(meta.email));
    case "member.invite_resent":
      return say("emailed the invitation again to", str(meta.email));
    case "member.invite_cancelled":
      return say("cancelled the invitation for", str(meta.email));
    case "member.joined":
      return say(
        "joined the site",
        null,
        str(meta.role) ? `as ${ROLE_WORDS[meta.role as string] ?? meta.role}` : null,
      );
    case "member.role_changed":
      return say(
        "changed the role of",
        name,
        str(meta.to) ? `to ${ROLE_WORDS[meta.to as string] ?? meta.to}` : null,
      );
    case "member.removed":
      return say("removed", name, "from the site");
    case "member.left":
      return say("left the site");
    case "ownership.transfer_requested":
      return say("started transferring ownership to", str(meta.recipientEmail));
    case "ownership.transfer_cancelled":
      return say("cancelled the ownership transfer to", str(meta.recipientEmail));
    case "ownership.transfer_declined":
      return say("declined the ownership transfer");
    case "ownership.transfer_accepted":
      return say("accepted ownership of the site");
    case "site.created":
      return say("created the site", name);
    case "site.updated":
      return say("changed the site's general settings");
    case "site.domain_changed":
      return say(
        meta.to ? "changed the website domain" : "removed the website domain",
        null,
        str(meta.to) ? `to ${meta.to}` : null,
      );
    case "site.archived":
      return say("archived the site");
    case "site.restored":
      return say("restored the site");
    case "seo.defaults_changed":
      return say("changed the SEO defaults");
    case "seo.indexing_allowed":
      return say("allowed search engines to index the site");
    case "seo.indexing_discouraged":
      return say("asked search engines not to index the site");
    case "redirect.created":
      return say("added a redirect from", str(meta.from), str(meta.to) ? `to ${meta.to}` : null);
    case "redirect.updated":
      return say(
        "changed the redirect from",
        str(meta.from),
        str(meta.to) ? `to ${meta.to}` : null,
      );
    case "redirect.deleted":
      return say("deleted the redirect from", str(meta.from));
    case "previews.url_changed":
      return say(meta.previewUrl ? "set the preview address" : "removed the preview address");
    case "api_key.created":
      return say("created the API key", name);
    case "api_key.revoked":
      return say("revoked the API key", name);
    case "performance.key_rotated":
      return say("replaced the Core Web Vitals reporting key");
    case "webhook.created":
      return say("added a webhook for", str(meta.url));
    case "webhook.updated":
      return say("changed the webhook for", str(meta.url));
    case "webhook.enabled":
      return say("turned on the webhook for", str(meta.url));
    case "webhook.disabled":
      return say("turned off the webhook for", str(meta.url));
    case "webhook.secret_rotated":
      return say("rotated the signing secret of the webhook for", str(meta.url));
    case "webhook.deleted":
      return say("deleted the webhook for", str(meta.url));
    default: {
      const words = action.replace(/[._]/g, " ");
      return say(`did “${words}” on`, title ?? name);
    }
  }
}
