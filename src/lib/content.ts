import { z } from "zod";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Content types, labels, list parameters and the per-entry policy. Shared by
 * server and client; the server always re-checks the policy before acting.
 */

export const CONTENT_STATUSES = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

/** Which entries a list shows: Pages, Posts, Collections (custom models), or all. */
export type ContentType = "all" | "page" | "post" | "collection";

export interface EntrySummary {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  modelKey: string;
  modelName: string;
  isSystemModel: boolean;
  authorId: string | null;
  authorName: string | null;
  /** The member working on it, if anyone (Team › Assignments). */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Optional due date, "YYYY-MM-DD". */
  dueOn: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

export interface EntryList {
  items: EntrySummary[];
  total: number;
  page: number;
  pageCount: number;
  /** Entries per status for the current type and search (ignoring the status filter). */
  counts: Record<ContentStatus, number>;
  /** Name of the member in an `assignee=<userId>` filter, for its label. */
  assigneeName?: string | null;
}

export const PAGE_SIZE = 20;

export const SORTS = {
  updated_desc: "Last updated",
  updated_asc: "Oldest updated",
  title_asc: "Title A–Z",
  title_desc: "Title Z–A",
} as const;
export type ContentSort = keyof typeof SORTS;

/** List parameters from the URL. Invalid values fall back to defaults rather than erroring. */
export const contentListParams = z.object({
  q: z.string().trim().max(200).catch(""),
  status: z.enum(["active", ...CONTENT_STATUSES]).catch("active"),
  sort: z.enum(Object.keys(SORTS) as [ContentSort, ...ContentSort[]]).catch("updated_desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  /** "taxonomyKey:slug", e.g. "category:news": entries that have that term. */
  term: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,39}:[a-z0-9-]{1,80}$/)
    .catch(""),
  /** "me", "none" (unassigned) or a member's user id. */
  assignee: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .catch(""),
});
export type ContentListParams = z.output<typeof contentListParams>;

/** "active" means every status except Archived. */
export type StatusFilter = ContentListParams["status"];

export function parseContentListParams(
  searchParams: Record<string, string | string[] | undefined>,
): ContentListParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return contentListParams.parse({
    q: first(searchParams.q) ?? "",
    status: first(searchParams.status) ?? "active",
    sort: first(searchParams.sort) ?? "updated_desc",
    page: first(searchParams.page) ?? 1,
    term: first(searchParams.term) ?? "",
    assignee: first(searchParams.assignee) ?? "",
  });
}

export type BulkAction = "archive" | "restore" | "delete";

/**
 * What a member may do to one entry. Owners, admins and editors manage any
 * entry. Authors manage only their own entries that have never been
 * published (archiving published content unpublishes it, which needs
 * publish rights). Permanent deletion is only offered for archived entries.
 */
export function entryActions(
  role: SiteRole,
  userId: string,
  entry: Pick<EntrySummary, "status" | "authorId"> & { publishedAt: string | Date | null },
): Record<BulkAction, boolean> {
  const manageAny = can(role, "content.edit_any");
  const ownUnpublished =
    can(role, "content.create") && entry.authorId === userId && entry.publishedAt === null;
  const canManage = manageAny || ownUnpublished;
  const isArchived = entry.status === "archived";
  return {
    archive: canManage && !isArchived,
    restore: canManage && isArchived,
    delete: canManage && isArchived,
  };
}

type PolicyEntry = Pick<EntrySummary, "status" | "authorId"> & {
  publishedAt: string | Date | null;
  assigneeId?: string | null;
};

/** Authors work on entries they wrote or that are assigned to them. */
const isOwnWork = (userId: string, entry: PolicyEntry) =>
  entry.authorId === userId || (entry.assigneeId != null && entry.assigneeId === userId);

/**
 * Whether a member may edit an entry's content, URL and SEO. Editors and
 * above edit anything that isn't archived. Authors edit their own entries,
 * and entries assigned to them, while they are drafts or in review; live and
 * scheduled content needs publish rights. Archived entries are read-only until
 * restored.
 */
export function canEditEntry(role: SiteRole, userId: string, entry: PolicyEntry): boolean {
  if (entry.status === "archived") return false;
  if (can(role, "content.edit_any")) return true;
  return (
    can(role, "content.create") &&
    isOwnWork(userId, entry) &&
    (entry.status === "draft" || entry.status === "in_review")
  );
}

/** Why an entry is read-only for this member, or null if they can edit it. */
export function readOnlyReason(role: SiteRole, userId: string, entry: PolicyEntry): string | null {
  if (canEditEntry(role, userId, entry)) return null;
  if (entry.status === "archived")
    return "This entry is archived. Restore it as a draft to edit it.";
  if (!can(role, "content.create"))
    return "Your role on this site can view content but not edit it.";
  if (!isOwnWork(userId, entry))
    return "Authors can only edit their own drafts and drafts assigned to them.";
  return "Published and scheduled content can only be changed by an editor, admin or owner.";
}

export type WorkflowAction =
  "publish" | "schedule" | "unpublish" | "submit" | "withdraw" | "request_changes";

/** Publishing transitions available to a member for an entry's current status. */
/** Site-wide publishing rules (Settings › Publishing) that affect the workflow. */
export interface WorkflowRules {
  /** Publishing needs a review first; owners and admins (who set the rule) are exempt. */
  requireReview: boolean;
}

export const NO_WORKFLOW_RULES: WorkflowRules = { requireReview: false };

/** Whether the require-review rule applies to this role. */
export function reviewRequired(role: SiteRole, rules: WorkflowRules): boolean {
  return rules.requireReview && !can(role, "site.update");
}

/**
 * Workflow actions a member may take. With "Require review" on, editors send
 * drafts for review like authors do, and may approve only entries someone
 * else sent; owners and admins can still publish directly.
 */
export function workflowActions(
  role: SiteRole,
  userId: string,
  entry: PolicyEntry & { reviewRequestedById?: string | null },
  rules: WorkflowRules = NO_WORKFLOW_RULES,
): Record<WorkflowAction, boolean> {
  const editable = canEditEntry(role, userId, entry);
  const publisher = editable && can(role, "content.publish");
  const gated = reviewRequired(role, rules);
  const requester = !can(role, "content.publish") || gated;
  const s = entry.status;
  const ownRequest = entry.reviewRequestedById != null && entry.reviewRequestedById === userId;
  // In review and sent by someone else: approving it is the review.
  const approvable = s === "in_review" && !(gated && ownRequest);
  return {
    publish: publisher && s !== "published" && (!gated || approvable || s === "scheduled"),
    schedule:
      publisher &&
      ((s === "draft" && !gated) || (s === "in_review" && approvable) || s === "scheduled"),
    unpublish: publisher && (s === "published" || s === "scheduled"),
    submit: editable && requester && s === "draft",
    withdraw:
      editable && s === "in_review" && (!can(role, "content.publish") || (gated && ownRequest)),
    request_changes: publisher && s === "in_review" && !(gated && ownRequest),
  };
}

/** URL-safe slug: "Hello, Wörld!" → "hello-world". */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "untitled"
  );
}
