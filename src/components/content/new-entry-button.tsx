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
 * content types; "collection" offers the custom types only.
 */
export function NewEntryButton({
  siteId,
  type,
  collections = [],
}: {
  siteId: string;
  type: "page" | "post" | "choose" | "collection";
  collections?: CollectionType[];
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending}>
          {icon}
          {pending ? "Creating…" : "New"}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
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
