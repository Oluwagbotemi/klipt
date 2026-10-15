"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Non-blocking notifications for low-risk results. Styled with theme tokens. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
