"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import {
  ModalBody,
  ModalFooter,
  ModalForm,
  ModalHeader,
  modalContentClass,
  modalOverlayClass,
  modalPanelClass,
  SheetHandle,
  type ModalSize,
} from "@/components/ui/modal-layout";
import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/**
 * Glass-framed modal (bottom sheet on phones). Compose with DialogHeader,
 * DialogBody and DialogFooter; wrap them in DialogForm for forms.
 * Sizes: sm 400px (confirmations, success), md 560px, lg 720px (forms, default).
 */
function DialogContent({
  className,
  children,
  showClose = true,
  size = "lg",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
  size?: ModalSize;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={modalOverlayClass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(modalContentClass(size), className)}
        {...props}
      >
        <div className={modalPanelClass}>
          <SheetHandle />
          {children}
          {showClose && (
            <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 absolute top-3 right-3 grid size-9 place-items-center rounded-lg outline-none focus-visible:ring-[3px] sm:top-4 sm:right-4">
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

const DialogHeader = ModalHeader;
const DialogBody = ModalBody;
const DialogFooter = ModalFooter;
const DialogForm = ModalForm;

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg leading-snug font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

const DialogClose = DialogPrimitive.Close;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogForm,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
};
