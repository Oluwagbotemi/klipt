"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  side = "left",
  closeLabel = "Close navigation",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "left" | "right";
  closeLabel?: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/50"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-sidebar data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-y-0 z-50 flex h-full w-[85%] max-w-xs flex-col shadow-xl transition ease-in-out data-[state=closed]:duration-150 data-[state=open]:duration-200",
          side === "left" &&
            "border-sidebar-border data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left left-0 border-r",
          side === "right" &&
            "border-sidebar-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right right-0 border-l",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-ring/50 absolute top-3 right-3 inline-flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-[3px]">
          <XIcon className="size-4" aria-hidden />
          <span className="sr-only">{closeLabel}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
