import type { ContentStatus } from "@/lib/content";
import type { PageIssueKey } from "@/lib/seo-audit";

/** Site Overview data (client-safe types). Everything here is counted from real records. */

export interface OverviewEntry {
  id: string;
  title: string;
  status: ContentStatus;
  modelKey: string;
  path: string;
  authorName: string | null;
  updatedAt: string;
  scheduledAt: string | null;
}

export interface SeoIssue {
  key: PageIssueKey;
  count: number;
  /** Up to three entries to fix first. */
  examples: { id: string; title: string }[];
}

export interface ActivityItem {
  id: string;
  actorName: string | null;
  action: string;
  targetTitle: string | null;
  /** Entry to link to, when the event is about one that still exists. */
  entryId: string | null;
  createdAt: string;
}

export interface SetupStep {
  key: "publish" | "media" | "api_key" | "webhook";
  done: boolean;
}

export interface SiteOverview {
  counts: Record<"published" | "draft" | "in_review" | "scheduled", number>;
  media: { total: number; missingAlt: number };
  inReview: OverviewEntry[];
  upcoming: OverviewEntry[];
  recent: OverviewEntry[];
  seoIssues: SeoIssue[];
  publishedCount: number;
  /** False when the whole site is hidden from search engines. */
  allowIndexing: boolean;
  activity: ActivityItem[];
  /** Only for members who can manage integrations; null otherwise. */
  setup: SetupStep[] | null;
  /** Failed webhook deliveries in the last 7 days (managers only). */
  webhookFailures: number | null;
}

const ACTIVITY_TEXT: Record<string, string> = {
  "content.created": "created",
  "content.published": "published",
  "content.unpublished": "unpublished",
  "content.scheduled": "scheduled",
  "content.submitted_for_review": "submitted for review",
  "content.withdrawn_from_review": "withdrew from review",
  "content.archived": "archived",
  "content.restored": "restored",
  "content.deleted": "deleted",
  "content.slug_changed": "changed the URL of",
  "media.uploaded": "uploaded",
  "media.deleted": "deleted the file",
  "api_key.created": "created the API key",
  "api_key.revoked": "revoked the API key",
  "webhook.created": "added a webhook for",
  "webhook.deleted": "deleted the webhook for",
  "site.created": "created the site",
  "member.joined": "joined the site",
  "member.role_changed": "changed the role of",
  "member.removed": "removed",
  "member.left": "left the site",
};

export const ACTIVITY_ACTIONS = Object.keys(ACTIVITY_TEXT);

export function activityVerb(action: string) {
  return ACTIVITY_TEXT[action] ?? action;
}
