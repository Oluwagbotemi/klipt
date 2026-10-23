"use client";

import { useEffect, useRef, useState } from "react";
import { numberParts, type NumberFormat } from "@/lib/visual";
import { cn } from "@/lib/utils";

const DURATION = 400;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that counts up to its value. The server renders the final value and
 * screen readers always get it; only the visible digits animate, and not at all
 * when the device asks for reduced motion. Decimals and units are muted.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format?: NumberFormat;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / DURATION);
      setShown(start + (value - start) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const decimals = format?.decimals ?? 0;
  const display = decimals === 0 ? Math.round(shown) : shown;
  return (
    <span className={className}>
      <span className="sr-only">
        <ValueText value={value} format={format} />
      </span>
      <span aria-hidden>
        <ValueText value={display} format={format} />
      </span>
    </span>
  );
}

/** A formatted number with muted prefix, decimals and unit (no animation). */
export function ValueText({
  value,
  format,
  className,
}: {
  value: number;
  format?: NumberFormat;
  className?: string;
}) {
  const parts = numberParts(value, format);
  return (
    <span className={cn("whitespace-nowrap", className)}>
      {parts.prefix && (
        <span className="mr-0.5 align-top text-[0.6em] opacity-60">{parts.prefix}</span>
      )}
      {parts.whole}
      {parts.fraction && <span className="opacity-60">{parts.fraction}</span>}
      {parts.unit && <span className="ml-0.5 text-[0.55em] opacity-60">{parts.unit}</span>}
    </span>
  );
}
