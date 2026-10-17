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
