"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies text to the clipboard and confirms it in place (announced to screen readers). */
export function CopyButton({
  value,
  label = "Copy",
  variant = "outline",
  className,
}: {
  value: string;
  label?: string;
  variant?: "outline" | "default" | "ghost";
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={copy} className={className}>
      {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
      </span>
    </Button>
  );
}
