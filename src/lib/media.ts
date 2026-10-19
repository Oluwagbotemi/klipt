import { z } from "zod";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Media library: shared types, limits and rules (client-safe).
 */

/**
 * Largest file accepted per upload. Vercel caps a request at 4.5 MB, so
 * larger images are resized in the browser before upload.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Accepted formats, checked against the file's actual bytes on the server. */
export const ACCEPTED_TYPES = {
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/png": { ext: "png", label: "PNG" },
  "image/webp": { ext: "webp", label: "WebP" },
  "image/gif": { ext: "gif", label: "GIF" },
  "image/avif": { ext: "avif", label: "AVIF" },
  "application/pdf": { ext: "pdf", label: "PDF" },
} as const;
export type AcceptedType = keyof typeof ACCEPTED_TYPES;

export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED_TYPES).join(",");

export const isImageType = (mime: string) => mime.startsWith("image/");

export const ALT_TEXT_MAX = 250;
export const CAPTION_MAX = 500;

export const mediaDetailsSchema = z.object({
  altText: z.string().trim().max(ALT_TEXT_MAX, `Keep alt text under ${ALT_TEXT_MAX} characters.`),
  caption: z.string().trim().max(CAPTION_MAX, `Keep the caption under ${CAPTION_MAX} characters.`),
});

export interface MediaAssetSummary {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string; // ISO 8601
}

export interface MediaUsage {
  id: string;
  title: string;
  status: string;
  modelKey: string;
}

export const MEDIA_PAGE_SIZE = 40;

export const MEDIA_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name (A–Z)",
  largest: "Largest first",
} as const;
export type MediaSort = keyof typeof MEDIA_SORTS;

export type MediaKind = "all" | "images" | "files";

export const mediaListParams = z.object({
  q: z.string().trim().max(100).catch(""),
  alt: z.enum(["missing"]).optional().catch(undefined),
  sort: z.enum(Object.keys(MEDIA_SORTS) as [MediaSort, ...MediaSort[]]).catch("newest"),
  view: z.enum(["grid", "list"]).catch("grid"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type MediaListParams = z.output<typeof mediaListParams>;

export function parseMediaListParams(
  query: Record<string, string | string[] | undefined>,
): MediaListParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return mediaListParams.parse({
    q: first(query.q) ?? "",
    alt: first(query.alt),
    sort: first(query.sort) ?? "newest",
    view: first(query.view) ?? "grid",
    page: first(query.page) ?? 1,
  });
}

export interface MediaList {
  items: MediaAssetSummary[];
  total: number;
  page: number;
  pageCount: number;
  counts: { all: number; images: number; files: number; missingAlt: number };
}

/**
 * Who may change or delete a file: editors and above for any file; authors
 * (who can upload) for their own uploads. Viewers can only look.
 */
export function canManageMedia(
  role: SiteRole,
  userId: string,
  asset: { uploadedById: string | null },
): boolean {
  if (can(role, "content.edit_any")) return true;
  return can(role, "media.upload") && asset.uploadedById === userId;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
