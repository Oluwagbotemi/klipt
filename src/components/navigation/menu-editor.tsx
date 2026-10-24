"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  Globe,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { saveMenuAction } from "@/app/(site)/sites/[siteId]/navigation/actions";
import { InlineAlert } from "@/components/inline-alert";
import { ReadOnlyNote } from "@/components/models/model-form-parts";
import { MenuItemDialog, type ItemFields } from "@/components/navigation/menu-item-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  blockEnd,
  canIndent,
  canMoveDown,
  canMoveUp,
  canOutdent,
  indent,
  moveDown,
  moveUp,
  outdent,
  removeAt,
} from "@/lib/menu-tree";
import {
  MAX_MENU_DEPTH,
  MAX_MENU_ITEMS,
  menuWarningText,
  type MenuDetail,
  type MenuItemView,
} from "@/lib/menus";
import { siteHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type Draft = MenuItemView;
type Action = "up" | "down" | "indent" | "outdent";

const toInput = (items: Draft[]) =>
  items.map(({ label, kind, entryId, url, openInNewTab, depth }) => ({
    label,
    kind,
    entryId,
    url,
    openInNewTab,
    depth,
  }));
const snapshot = (items: Draft[]) => JSON.stringify(toInput(items));
const newKey = () => `new-${Math.random().toString(36).slice(2, 10)}`;

/** One menu: its links in order, with nesting, saved all at once. */
export function MenuEditor({
  siteId,
  siteDomain,
  menu,
  canManage,
}: {
  siteId: string;
  siteDomain: string | null;
  menu: MenuDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Draft[]>(menu.items);
  const [version, setVersion] = useState(menu.updatedAt);
  const [savedItems, setSavedItems] = useState<Draft[]>(menu.items);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<{
    message: string;
    conflict?: boolean;
    index?: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [saving, startSaving] = useTransition();
  const [reloading, startReloading] = useTransition();
  const [leaving, setLeaving] = useState<string | null>(null);
  const focusAfter = useRef<{ key: string; action: Action | "edit" } | null>(null);
  const latestItems = useRef(items);

  // Newer data from the server (after a save elsewhere and "Load latest") replaces local state.
  const [syncedVersion, setSyncedVersion] = useState(menu.updatedAt);
  if (menu.updatedAt !== syncedVersion) {
    setSyncedVersion(menu.updatedAt);
    if (menu.updatedAt > version) {
      setVersion(menu.updatedAt);
      setItems(menu.items);
      setSavedItems(menu.items);
      setError(null);
    }
  }

  const dirty = snapshot(items) !== snapshot(savedItems);

  useEffect(() => {
    latestItems.current = items;
  }, [items]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // In-app links don't unload the page, so ask before following them too.
    const guardLinks = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.download) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);

  // Keep keyboard focus on the button that was used, wherever the item moved.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const row = document.querySelector<HTMLElement>(`[data-menu-item="${target.key}"]`);
    const button =
      row?.querySelector<HTMLButtonElement>(`[data-action="${target.action}"]:not(:disabled)`) ??
      row?.querySelector<HTMLButtonElement>("[data-action]:not(:disabled)");
    button?.focus();
  }, [items]);

  function apply(index: number, action: Action) {
    const item = items[index];
    const next = { up: moveUp, down: moveDown, indent, outdent }[action](items, index);
    focusAfter.current = { key: item.id, action };
    setItems(next);
    const position = next.findIndex((entry) => entry.id === item.id);
    const parent = next
      .slice(0, position)
      .reverse()
      .find((entry) => entry.depth < next[position].depth);
    setAnnouncement(
      `${item.label}: ${
        { up: "moved up", down: "moved down", indent: "indented", outdent: "moved out a level" }[
          action
        ]
      }. ${parent ? `Under ${parent.label}.` : "Top level."} Item ${position + 1} of ${next.length}.`,
    );
  }

  function save() {
    setError(null);
    const submitted = snapshot(items);
    startSaving(async () => {
      const result = await saveMenuAction(siteId, menu.key, {
        items: toInput(items),
        expectedUpdatedAt: version,
      });
      if (result.ok) {
        setVersion(result.menu.updatedAt);
        setSyncedVersion(result.menu.updatedAt);
        setSavedItems(result.menu.items);
        // Keep edits made while the save was running; they stay unsaved.
        if (snapshot(latestItems.current) === submitted) setItems(result.menu.items);
        toast.success(`${menu.name} menu saved.`);
      } else {
        setError({ message: result.error, conflict: result.conflict, index: result.index });
      }
    });
  }

  function submitItem(fields: ItemFields) {
    if (!editing) return;
    if (editing.index === null) {
      const item: Draft = { ...fields, id: newKey(), depth: 0 };
      focusAfter.current = { key: item.id, action: "edit" };
      setItems([...items, item]);
      setAnnouncement(`Added ${fields.label} at the end.`);
    } else {
      const index = editing.index;
      focusAfter.current = { key: items[index].id, action: "edit" };
      setItems(items.map((item, i) => (i === index ? { ...item, ...fields } : item)));
    }
    setEditing(null);
  }

  function remove(index: number) {
    const item = items[index];
    setItems(removeAt(items, index));
    setAnnouncement(`Removed ${item.label}.`);
  }

  const editingItem = editing?.index != null ? items[editing.index] : null;
  const removingChildren = removing !== null ? blockEnd(items, removing) - removing - 1 : 0;
  const hiddenCount = items.filter((item) => item.warning).length;
  const atLimit = items.length >= MAX_MENU_ITEMS;

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 pb-28 sm:px-8">
      <div className="flex flex-col gap-3">
        <Link
          href={siteHref(siteId, "navigation")}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-fit items-center gap-1.5 rounded text-sm outline-none focus-visible:ring-[3px]"
        >
          <ArrowLeft className="size-4" aria-hidden /> All menus
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-2xl font-semibold tracking-tight break-words">{menu.name}</h2>
          {menu.isSystem && <Badge variant="secondary">Site menu</Badge>}
          <code className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs break-all">
            /api/v1/menus/{menu.key}
          </code>
        </div>
      </div>

      {!canManage && (
        <ReadOnlyNote>
          You can view this menu. Only owners, admins and editors can change it.
        </ReadOnlyNote>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <SettingsCard
          layout="stacked"
          title="Links"
          icon={Link2}
          description={`Up to ${MAX_MENU_DEPTH} levels: top-level links and one level of links under them. Use the arrow and indent buttons to arrange them.`}
        >
          <div className="flex flex-col gap-4">
            {error && (
              <InlineAlert>
                <p>
                  {error.message}
                  {error.index !== undefined && items[error.index] && (
                    <>
                      {" "}
                      (link {error.index + 1}, “{items[error.index].label}”)
                    </>
                  )}
                </p>
                {error.conflict && (
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-foreground">
                      Load their version to continue; your unsaved changes here will be lost.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reloading}
                      onClick={() => startReloading(() => router.refresh())}
                    >
                      {reloading && <Loader2 className="animate-spin" aria-hidden />}
                      Load latest version
                    </Button>
                  </p>
                )}
              </InlineAlert>
            )}

            {items.length === 0 ? (
              <p className="text-muted-foreground border-card-border bg-card-nested rounded-(--radius-nested) border border-dashed px-4 py-6 text-center text-sm">
                This menu is empty.
                {canManage && " Add links to pages, posts or other websites."}
              </p>
            ) : (
              <ol
                className="border-card-border divide-card-border divide-y rounded-(--radius-nested) border"
                aria-label={`${menu.name} links`}
              >
                {items.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    items={items}
                    canManage={canManage}
                    highlighted={error?.index === index}
                    onAction={(action) => apply(index, action)}
                    onEdit={() => setEditing({ index })}
                    onRemove={() =>
                      blockEnd(items, index) - index > 1 ? setRemoving(index) : remove(index)
                    }
                  />
                ))}
              </ol>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
            {canManage && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => setEditing({ index: null })}
                  disabled={atLimit}
                >
                  <Plus aria-hidden /> Add link
                </Button>
                {atLimit && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    A menu can have up to {MAX_MENU_ITEMS} links.
                  </p>
                )}
              </div>
            )}
          </div>
        </SettingsCard>

        <MenuPreview items={items} hiddenCount={hiddenCount} siteDomain={siteDomain} />
      </div>

      {canManage && (
        <div
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"
          aria-label="Save menu"
          role="region"
        >
          <p className="mr-auto text-sm" role="status">
            {saving ? (
              <span className="text-muted-foreground">Saving…</span>
            ) : dirty ? (
              <span className="text-warning flex items-center gap-1.5 font-medium">
                <CircleDot className="size-4" aria-hidden /> Unsaved changes
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="text-success size-4" aria-hidden /> All changes saved
              </span>
            )}
          </p>
          {dirty && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setItems(savedItems);
                setAnnouncement("Changes discarded.");
                setError(null);
              }}
            >
              Discard changes
            </Button>
          )}
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {saving ? "Saving…" : "Save menu"}
          </Button>
        </div>
      )}

      {canManage && (
        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          {editing !== null && (
            <MenuItemDialog
              key={editingItem?.id ?? "new"}
              siteId={siteId}
              item={editingItem}
              onSubmit={submitItem}
            />
          )}
        </Dialog>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={Trash2} tone="destructive">
            <AlertDialogTitle>
              Remove “{removing !== null ? items[removing]?.label : ""}”?
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              The {removingChildren === 1 ? "link" : `${removingChildren} links`} under it will be
              removed too. Nothing changes on your site until you save the menu.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing !== null) remove(removing);
                setRemoving(null);
              }}
            >
              Remove links
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaving !== null} onOpenChange={(open) => !open && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={TriangleAlert} tone="warning">
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Your changes to the {menu.name} menu haven&apos;t been saved and will be lost.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (leaving) router.push(leaving);
                setLeaving(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemRow({
  item,
  index,
  items,
  canManage,
  highlighted,
  onAction,
  onEdit,
  onRemove,
}: {
  item: Draft;
  index: number;
  items: Draft[];
  canManage: boolean;
  highlighted: boolean;
  onAction: (action: Action) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const Icon = item.kind === "url" ? Globe : FileText;
  const destination =
    item.kind === "url"
      ? item.url
      : item.target
        ? `${item.target.title} · ${item.target.path}`
        : "Deleted entry";
  const buttons: { action: Action; label: string; icon: typeof ArrowUp; enabled: boolean }[] = [
    { action: "up", label: "Move up", icon: ArrowUp, enabled: canMoveUp(items, index) },
    { action: "down", label: "Move down", icon: ArrowDown, enabled: canMoveDown(items, index) },
    {
      action: "outdent",
      label: "Move out a level",
      icon: IndentDecrease,
      enabled: canOutdent(items, index),
    },
    {
      action: "indent",
      label: "Indent under the link above",
      icon: IndentIncrease,
      enabled: canIndent(items, index),
    },
  ];

  return (
    <li
      data-menu-item={item.id}
      data-depth={item.depth}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-2 sm:pr-4",
        item.depth > 0 ? "bg-muted/40 pl-6 sm:pl-12" : "pl-3 sm:pl-4",
        highlighted && "bg-destructive/5",
      )}
      aria-label={item.depth > 0 ? `${item.label}, under the link above` : undefined}
    >
      <span
        className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg"
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium break-words">{item.label}</span>
          {item.openInNewTab && (
            <Badge variant="outline">
              <ExternalLink aria-hidden /> New tab
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground truncate text-xs">{destination}</p>
        {item.warning && (
          <p className="text-warning mt-1 flex items-start gap-1.5 text-xs">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            {menuWarningText(item.warning)}
          </p>
        )}
      </div>
      {canManage && (
        <div className="-my-1 flex w-full flex-wrap items-center justify-end gap-0.5 sm:w-auto sm:gap-1">
          {buttons.map((button) => (
            <Button
              key={button.action}
              variant="ghost"
              size="icon"
              data-action={button.action}
              disabled={!button.enabled}
              onClick={() => onAction(button.action)}
              aria-label={`${button.label}: ${item.label}`}
              title={button.label}
            >
              <button.icon aria-hidden />
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            data-action="edit"
            onClick={onEdit}
            aria-label={`Edit ${item.label}`}
            title="Edit"
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Remove ${item.label}`}
            title="Remove"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}

/** What the content API returns: hidden links (unpublished or deleted entries) left out. */
function MenuPreview({
  items,
  hiddenCount,
  siteDomain,
}: {
  items: Draft[];
  hiddenCount: number;
  siteDomain: string | null;
}) {
  const visible: { item: Draft; children: Draft[] }[] = [];
  let parentVisible = false;
  for (const item of items) {
    const shown = !item.warning;
    if (item.depth === 0) {
      parentVisible = shown;
      if (shown) visible.push({ item, children: [] });
    } else if (parentVisible && shown) {
      visible.at(-1)?.children.push(item);
    }
  }
  const href = (item: Draft) => (item.kind === "url" ? item.url : item.target?.path) ?? "";

  return (
    <section
      aria-labelledby="menu-preview"
      data-sticky-panel
      className="visual-card flex flex-col gap-3 p-5 lg:sticky lg:top-20"
    >
      <div>
        <h2 id="menu-preview" className="text-base font-semibold">
          Preview
        </h2>
        <p className="text-muted-foreground text-xs">
          The links your website{siteDomain ? ` (${siteDomain})` : ""} gets, including unsaved
          changes. Your site decides how they look.
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No visible links.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm" aria-label="Menu preview">
          {visible.map(({ item, children }) => (
            <li key={item.id} className="min-w-0">
              <span className="block truncate font-medium">{item.label}</span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {href(item)}
              </span>
              {children.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1.5 border-l pl-3">
                  {children.map((child) => (
                    <li key={child.id} className="min-w-0">
                      <span className="block truncate">{child.label}</span>
                      <span className="text-muted-foreground block truncate font-mono text-xs">
                        {href(child)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <p className="text-warning flex items-start gap-1.5 text-xs">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {hiddenCount === 1 ? "1 link is" : `${hiddenCount} links are`} hidden because the entry
          isn&apos;t published or was deleted.
        </p>
      )}
    </section>
  );
}
