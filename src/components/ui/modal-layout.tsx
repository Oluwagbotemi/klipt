import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Layout shared by Dialog and AlertDialog. A modal is a 4px glass frame around a
 * soft panel: header (icon tile + title + description), a white body card, and a
 * footer of equal-width buttons. Below `sm` every modal is a bottom sheet.
 */

export type ModalSize = "sm" | "md" | "lg";

const SIZES: Record<ModalSize, string> = {
  sm: "sm:max-w-[400px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[720px]",
};

export const modalOverlayClass =
  "modal-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

/** The positioned glass frame: a bottom sheet on phones, centered from `sm`. */
export function modalContentClass(size: ModalSize) {
  return cn(
    "modal-glass fixed z-50 flex flex-col outline-none duration-200",
    // Phone: full-width sheet from the bottom; the frame's padding is dropped.
    "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:rounded-t-[28px]",
    // From sm: centered card with the 4px glass frame.
    "sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px] sm:p-1",
    SIZES[size],
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
    "max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom",
    "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
  );
}

export const modalPanelClass =
  "bg-modal-panel text-foreground relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-t-[28px] sm:rounded-[10px]";

/** Decorative handle at the top of the bottom sheet. */
export function SheetHandle() {
  return (
    <div
      aria-hidden
      className="bg-foreground/15 mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full sm:hidden"
    />
  );
}

type Tone = "primary" | "destructive" | "warning" | "success";

const TONES: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
};

/** Rounded icon tile shown beside (or above) the title. */
export function ModalIcon({
  icon: Icon,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[10px] shadow-xs",
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

export function ModalHeader({
  icon,
  tone,
  centered = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: LucideIcon;
  tone?: Tone;
  /** Icon above a centered title, for success and simple confirmation modals. */
  centered?: boolean;
}) {
  return (
    <div
      data-slot="modal-header"
      className={cn(
        "flex shrink-0 gap-3 px-5 pt-4 pb-4 sm:px-5 sm:pt-5",
        centered ? "flex-col items-center px-8 text-center sm:px-10" : "items-start pr-14",
        className,
      )}
      {...props}
    >
      {icon && <ModalIcon icon={icon} tone={tone} className={centered ? "size-12" : undefined} />}
      <div className={cn("flex min-w-0 flex-col gap-1", centered ? "items-center" : "pt-0.5")}>
        {children}
      </div>
    </div>
  );
}

/** The white inner card. It scrolls when the modal is taller than the screen. */
export function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-body"
      className={cn(
        "bg-modal-body border-border/70 mx-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[8px] border p-4 sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

/** Equal-width buttons: cancel on the left, primary on the right. Stacked on phones. */
export function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "sm:grid sm:auto-cols-fr sm:grid-flow-col sm:px-2 sm:pt-3 sm:pb-2",
        "*:h-12 *:w-full *:rounded-full sm:*:h-11 sm:*:rounded-[10px]",
        className,
      )}
      {...props}
    />
  );
}

/** A form that holds header, body and footer, keeping the body scrollable. */
export function ModalForm({ className, ...props }: React.ComponentProps<"form">) {
  return <form className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />;
}
