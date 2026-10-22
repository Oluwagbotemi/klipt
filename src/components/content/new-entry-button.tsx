"use client";

import { useTransition } from "react";
import { Boxes, ChevronDown, FileText, Loader2, Newspaper, Plus } from "lucide-react";
import { toast } from "sonner";
import { createEntryAction } from "@/app/(site)/sites/[siteId]/content/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionType } from "@/lib/models";

/** Starts creating a draft; the action redirects to it on success. */
export function useCreateEntry(siteId: string) {
  const [pending, startTransition] = useTransition();
  const create = (modelKey: string) =>
    startTransition(async () => {
      const result = await createEntryAction(siteId, modelKey);
      if (result?.error) toast.error(result.error);
    });
  return { create, pending };
}

/**
 * "New page", "New post", or a menu: "choose" offers pages, posts and custom
 * content types; "collection" offers the custom types only. With `defaultKey`,
 * "choose" becomes a split button that creates that type in one click (the
 * default from Settings › Publishing) and keeps the others in its menu.
 */
export function NewEntryButton({
  siteId,
  type,
  collections = [],
  defaultKey,
}: {
  siteId: string;
  type: "page" | "post" | "choose" | "collection";
  collections?: CollectionType[];
  defaultKey?: string;
}) {
  const { create, pending } = useCreateEntry(siteId);
  const icon = pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />;

  if (type === "page" || type === "post" || (type === "collection" && collections.length === 1)) {
    const key = type === "collection" ? collections[0].key : type;
    const label = type === "collection" ? collections[0].name : type === "page" ? "page" : "post";
    return (
      <Button onClick={() => create(key)} disabled={pending}>
        {icon}
        <span className="truncate">{pending ? "Creating…" : `New ${label}`}</span>
      </Button>
    );
  }
  if (type === "collection" && collections.length === 0) return null;

  const defaultName =
    defaultKey === "page"
      ? "page"
      : defaultKey === "post"
        ? "post"
        : collections.find((collection) => collection.key === defaultKey)?.name;
  const split = type === "choose" && defaultKey && defaultName;

  return (
    <DropdownMenu>
      {split ? (
        <div className="flex min-w-0">
          <Button
            onClick={() => create(defaultKey)}
            disabled={pending}
            className="min-w-0 rounded-r-none"
          >
            {icon}
            <span className="truncate">{pending ? "Creating…" : `New ${defaultName}`}</span>
          </Button>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="rounded-l-none border-l border-l-black/10"
              aria-label="Choose another content type"
              disabled={pending}
            >
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </div>
      ) : (
        <DropdownMenuTrigger asChild>
          <Button disabled={pending}>
            {icon}
            {pending ? "Creating…" : "New"}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="w-52">
        {type === "choose" && (
          <>
            <DropdownMenuItem onSelect={() => create("page")}>
              <FileText aria-hidden /> Page
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create("post")}>
              <Newspaper aria-hidden /> Post
            </DropdownMenuItem>
            {collections.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {collections.map((collection) => (
          <DropdownMenuItem key={collection.key} onSelect={() => create(collection.key)}>
            <Boxes aria-hidden />
            <span className="truncate">{collection.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
