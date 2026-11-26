"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The card every sign-in and welcome screen sits in: Klipt and the form on the
 * left, an illustration of Klipt on the right (from `lg`; phones get the form
 * only). It is the same height on every page and step: the header stays at the
 * top, the content scrolls, and the footer (the CTAs) stays pinned at the bottom
 * with content passing underneath it. Phones get it full screen.
 */
export function AuthCard({
  visual,
  children,
  header,
  footer,
  wide = false,
  logoHref = "/sign-in",
}: {
  /** A scene from `./scenes`, shown in the grey panel. */
  visual: React.ReactNode;
  children: React.ReactNode;
  /** Fixed under the logo, e.g. the welcome flow's progress and Skip. */
  header?: React.ReactNode;
  /** Pinned at the bottom: buttons (use `form=` to submit a form above) or a link line. */
  footer?: React.ReactNode;
  /** Wider content column, for the welcome steps' choice cards. */
  wide?: boolean;
  logoHref?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // True while content sits under the footer: then its divider shows.
  const [under, setUnder] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setUnder(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const column = wide ? "max-w-2xl" : "max-w-md";
  return (
    <div
      data-auth-card
      className={cn(
        "bg-background grid w-full max-w-[1200px] overflow-hidden",
        // Phones: the whole screen. Larger: one fixed height on every page and step.
        "h-dvh sm:h-[min(760px,calc(100dvh-3rem))] sm:min-h-[560px] sm:rounded-[28px] sm:border",
        "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 px-5 pt-5 sm:px-10 sm:pt-9 lg:px-12 lg:pt-10">
          <div className="flex items-center justify-between gap-4">
            <Logo href={logoHref} />
            <ThemeToggle />
          </div>
          {header && <div className={cn("mt-6 w-full sm:mt-8", column)}>{header}</div>}
        </div>
        <div
          ref={scroller}
          data-auth-scroll
          className="auth-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-10 lg:px-12"
        >
          <div className={cn("flex min-h-full w-full flex-col justify-center py-6", column)}>
            {children}
          </div>
        </div>
        {footer && (
          <div
            data-auth-footer
            data-under={under || undefined}
            className={cn(
              "bg-background relative shrink-0 border-t border-transparent px-5 py-4 transition-colors sm:px-10 sm:py-5 lg:px-12",
              "data-under:border-card-border data-under:shadow-[0_-12px_24px_-16px_color-mix(in_srgb,var(--foreground)_18%,transparent)]",
            )}
          >
            <div className={cn("w-full", column)}>{footer}</div>
          </div>
        )}
      </div>
      <div className="hidden min-h-0 p-3 lg:flex" aria-hidden>
        <div className="bg-card-nested relative flex w-full items-center overflow-hidden rounded-[22px]">
          {visual}
        </div>
      </div>
    </div>
  );
}

/** Title + one muted line, the same on every screen. */
export function AuthHeading({
  title,
  description,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div>
      {eyebrow && <p className="text-muted-foreground mb-2 text-sm">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-9">{title}</h1>
      {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
    </div>
  );
}

/** Back on the left, the main action on the right: the welcome steps' footer row. */
export function FooterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>;
}
