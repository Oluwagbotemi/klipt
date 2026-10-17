"use client";

import { useTransition } from "react";
import { ChevronDown, FileText, Loader2, Newspaper, Plus } from "lucide-react";
import { toast } from "sonner";
import { createEntryAction } from "@/app/(site)/sites/[siteId]/content/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Starts creating a draft; the action redirects to it on success. */
export function useCreateEntry(siteId: string) {
  const [pending, startTransition] = useTransition();
  const create = (modelKey: "page" | "post") =>
    startTransition(async () => {
      const result = await createEntryAction(siteId, modelKey);
      if (result?.error) toast.error(result.error);
    });
  return { create, pending };
}

/** "New page", "New post", or a menu with both. */
export function NewEntryButton({
  siteId,
  type,
}: {
  siteId: string;
  type: "page" | "post" | "choose";
}) {
  const { create, pending } = useCreateEntry(siteId);
  const icon = pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />;

  if (type !== "choose") {
    return (
      <Button onClick={() => create(type)} disabled={pending}>
        {icon}
        {pending ? "Creating…" : type === "page" ? "New page" : "New post"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending}>
          {icon}
          {pending ? "Creating…" : "New"}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => create("page")}>
          <FileText aria-hidden /> Page
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => create("post")}>
          <Newspaper aria-hidden /> Post
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
