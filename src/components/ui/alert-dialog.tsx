"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { buttonVariants } from "@/components/ui/button";
import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalContentClass,
  modalOverlayClass,
  modalPanelClass,
  SheetHandle,
  type ModalSize,
} from "@/components/ui/modal-layout";
import { cn } from "@/lib/utils";

function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

/** Confirmation modal: same frame as Dialog, 400px by default, no close button. */
function AlertDialogContent({
  className,
  children,
  size = "sm",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & { size?: ModalSize }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={modalOverlayClass} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(modalContentClass(size), className)}
        {...props}
      >
        <div className={modalPanelClass}>
          <SheetHandle />
          {children}
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<typeof ModalHeader>) {
  return <ModalHeader className={cn("pr-5", className)} {...props} />;
}

const AlertDialogBody = ModalBody;
const AlertDialogFooter = ModalFooter;

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg leading-snug font-semibold tracking-tight break-words", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: "default" | "destructive";
}) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
