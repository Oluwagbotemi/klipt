"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  SearchX,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { TABLE_BODY, TABLE_ROW, TableCard } from "@/components/visual/table-card";
import { MediaDetailsSheet } from "@/components/media/media-details";
import { MediaThumb } from "@/components/media/media-thumb";
import { UploadQueue } from "@/components/media/upload-queue";
import { useUploads } from "@/components/media/use-uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
  MEDIA_PAGE_SIZE,
  MEDIA_SORTS,
  canManageMedia,
  formatBytes,
  isImageType,
  type MediaAssetSummary,
  type MediaKind,
  type MediaList,
  type MediaListParams,
  type MediaSort,
  type MediaUsage,
} from "@/lib/media";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const NOUN: Record<MediaKind, string> = { all: "files", images: "images", files: "documents" };

type Params = MediaListParams & { file?: string };

/** Builds a media URL from the current parameters plus changes, omitting defaults. */
function mediaHref(pathname: string, params: Params, changes: Partial<Params>) {
  const next = { ...params, page: 1, file: undefined, ...changes };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.alt) query.set("alt", next.alt);
  if (next.sort !== "newest") query.set("sort", next.sort);
  if (next.view !== "grid") query.set("view", next.view);
  if (next.page > 1) query.set("page", String(next.page));
  if (next.file) query.set("file", next.file);
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

const isMissingAlt = (asset: MediaAssetSummary) => isImageType(asset.mimeType) && !asset.altText;

export function MediaLibrary({
  siteId,
  kind,
  role,
  userId,
  list,
  params,
  selected,
}: {
  siteId: string;
  kind: MediaKind;
  role: SiteRole;
  userId: string;
  list: MediaList;
  params: MediaListParams;
  selected: (MediaAssetSummary & { usage: MediaUsage[] }) | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [query, setQuery] = useState(params.q);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canUpload = can(role, "media.upload");
  const uploads = useUploads(siteId);
  const current: Params = { ...params, file: selected?.id };

  const [syncedQ, setSyncedQ] = useState(params.q);
  if (params.q !== syncedQ) {
    setSyncedQ(params.q);
    setQuery(params.q);
  }
  useEffect(() => {
    if (query.trim() === params.q) return;
    const timer = setTimeout(() => {
      startNavigation(() => router.replace(mediaHref(pathname, current, { q: query.trim() })));
    }, 300);
    return () => clearTimeout(timer);
  });

  const go = (changes: Partial<Params>) =>
    startNavigation(() => router.replace(mediaHref(pathname, current, changes), { scroll: false }));
  const open = (asset: MediaAssetSummary) =>
    router.push(mediaHref(pathname, current, { page: params.page, file: asset.id }), {
      scroll: false,
    });
  const close = () =>
    router.replace(mediaHref(pathname, current, { page: params.page, file: undefined }), {
      scroll: false,
    });

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (canUpload && event.dataTransfer.files.length) void uploads.upload(event.dataTransfer.files);
  }

  const filtered = params.q !== "" || params.alt === "missing";
  const isEmptyLibrary = list.counts.all === 0;
  const first = (list.page - 1) * MEDIA_PAGE_SIZE + 1;
  const last = first + list.items.length - 1;

  return (
    <div
      className="relative flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-6"
      onDragEnter={(e) => {
        if (!canUpload || !e.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => canUpload && e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging && (
        <div
          aria-hidden
          className="border-primary bg-primary-soft/80 text-primary-strong pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-(--radius-card) border-2 border-dashed text-sm font-medium"
        >
          Drop files to upload
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <label htmlFor="media-search" className="sr-only">
            Search {NOUN[kind]}
          </label>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="media-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, alt text or caption"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {kind !== "files" && list.counts.missingAlt > 0 && (
            <Button
              variant="soft"
              size="sm"
              aria-pressed={params.alt === "missing"}
              onClick={() => go({ alt: params.alt === "missing" ? undefined : "missing" })}
              className={cn(
                params.alt === "missing" &&
                  "bg-warning-soft text-warning-strong hover:bg-warning-soft border-transparent",
              )}
            >
              <TriangleAlert aria-hidden />
              Missing alt text ({list.counts.missingAlt})
            </Button>
          )}
          <label htmlFor="media-sort" className="sr-only">
            Sort
          </label>
          <select
            id="media-sort"
            value={params.sort}
            onChange={(e) => go({ sort: e.target.value as MediaSort })}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]"
          >
            {Object.entries(MEDIA_SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div role="group" aria-label="View" className="bg-muted flex gap-0.5 rounded-full p-1">
            {(["grid", "list"] as const).map((view) => {
              const Icon = view === "grid" ? LayoutGrid : List;
              return (
                <Button
                  key={view}
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "size-8 rounded-full border border-transparent",
                    params.view === view
                      ? "border-card-border bg-surface-card text-foreground hover:bg-surface-card"
                      : "text-muted-foreground",
                  )}
                  aria-pressed={params.view === view}
                  aria-label={view === "grid" ? "Grid view" : "List view"}
                  onClick={() => go({ view, page: params.page })}
                >
                  <Icon aria-hidden />
                </Button>
              );
            })}
          </div>
          {canUpload && (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  if (e.target.files?.length) void uploads.upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden />
                Upload
              </Button>
            </>
          )}
        </div>
      </div>

      <UploadQueue items={uploads.items} onClear={uploads.clearFinished} />

      <p className="sr-only" aria-live="polite">
        {navigating ? "Loading" : `${list.total} ${NOUN[kind]}`}
      </p>

      <div
        className={cn("transition-opacity", navigating && "opacity-60")}
        aria-busy={navigating || undefined}
      >
        {list.items.length === 0 ? (
          filtered && !isEmptyLibrary ? (
            <EmptyState
              icon={SearchX}
              scene={params.q ? "search" : "success"}
              title={`No matching ${NOUN[kind]}`}
              description={
                params.q
                  ? `Nothing matches “${params.q}”.`
                  : "Every image here has alt text. Nice work."
              }
              action={
                <Button variant="soft" asChild>
                  <Link href={pathname} onClick={() => setQuery("")}>
                    Clear filters
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ImageIcon}
              scene="media"
              title={kind === "all" ? "No media yet" : `No ${NOUN[kind]} yet`}
              description={
                canUpload
                  ? `Upload images (JPEG, PNG, WebP, GIF, AVIF) or PDFs up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB, or drag them onto this page. Larger photos are resized for you.`
                  : "Files uploaded by your team will appear here."
              }
              action={
                canUpload && (
                  <Button onClick={() => fileInput.current?.click()}>
                    <Upload aria-hidden />
                    Upload files
                  </Button>
                )
              }
            />
          )
        ) : params.view === "grid" ? (
          <ul
            aria-label={NOUN[kind]}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
          >
            {list.items.map((asset) => (
              <li key={asset.id} className="flex">
                <button
                  type="button"
                  onClick={() => open(asset)}
                  aria-label={`${asset.filename}${isMissingAlt(asset) ? ", missing alt text" : ""}`}
                  className="group visual-card visual-lift focus-visible:ring-ring/50 flex w-full flex-col overflow-hidden p-1.5 text-left outline-none focus-visible:ring-[3px]"
                >
                  <span className="bg-card-nested relative block aspect-square overflow-hidden rounded-(--radius-nested)">
                    <MediaThumb
                      asset={asset}
                      className="transition-transform group-hover:scale-[1.03]"
                    />
                    {isMissingAlt(asset) && (
                      <Badge variant="warning" className="absolute top-2 left-2">
                        <TriangleAlert aria-hidden />
                        No alt text
                      </Badge>
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 px-1.5 pt-2 pb-1">
                    <span className="truncate text-sm font-medium">{asset.filename}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {formatBytes(asset.sizeBytes)}
                      {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <TableCard as="ul" aria-label={NOUN[kind]} className={TABLE_BODY}>
            {list.items.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => open(asset)}
                  className={cn(
                    TABLE_ROW,
                    "focus-visible:ring-ring/50 flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset",
                  )}
                >
                  <span className="bg-card-nested size-11 shrink-0 overflow-hidden rounded-xl">
                    <MediaThumb asset={asset} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{asset.filename}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {isImageType(asset.mimeType)
                        ? asset.altText || "No alt text"
                        : asset.caption || asset.mimeType}
                    </span>
                  </span>
                  {isMissingAlt(asset) && (
                    <Badge variant="warning" className="hidden sm:inline-flex">
                      <TriangleAlert aria-hidden />
                      No alt text
                    </Badge>
                  )}
                  <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs md:block">
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"}
                  </span>
                  <span className="text-muted-foreground w-16 shrink-0 text-right text-xs">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                  <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs lg:block">
                    {formatDate(asset.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </TableCard>
        )}
      </div>

      {list.pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {first}–{last} of {list.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="soft"
              size="sm"
              disabled={list.page <= 1}
              onClick={() => go({ page: list.page - 1 })}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="soft"
              size="sm"
              disabled={list.page >= list.pageCount}
              onClick={() => go({ page: list.page + 1 })}
              aria-label="Next page"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      )}

      <MediaDetailsSheet
        siteId={siteId}
        asset={selected}
        canManage={selected ? canManageMedia(role, userId, selected) : false}
        onClose={close}
      />
    </div>
  );
}
