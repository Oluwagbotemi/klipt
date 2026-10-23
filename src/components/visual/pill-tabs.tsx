"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A pill segmented control kept in the URL (?param=value). The white highlight
 * slides to the chosen option; arrow keys move between options (radio group).
 * Options share the width equally, so the highlight needs no measuring.
 */
export function PillTabs({
  label,
  param,
  value,
  options,
  defaultValue,
  className,
}: {
  /** Accessible name, e.g. "Period". */
  label: string;
  param: string;
  value: string;
  options: { value: string; label: string; description?: string }[];
  /** The value that needs no query parameter. */
  defaultValue?: string;
  className?: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(value);
  const [synced, setSynced] = useState(value);
  const [pending, startTransition] = useTransition();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // A new value from the server (back/forward navigation) wins.
  if (value !== synced) {
    setSynced(value);
    setChosen(value);
  }

  const index = Math.max(
    0,
    options.findIndex((option) => option.value === chosen),
  );

  function choose(next: string) {
    if (next === chosen) return;
    setChosen(next);
    // Read the URL at click time, so the control needs no Suspense boundary.
    const query = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    if (next === defaultValue) query.delete(param);
    else query.set(param, next);
    const search = query.toString();
    startTransition(() =>
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }),
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    buttons.current[next]?.focus();
    choose(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={pending || undefined}
      onKeyDown={onKeyDown}
      className={cn("bg-muted relative inline-grid h-10 rounded-full p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="bg-surface-card absolute top-1 bottom-1 left-1 rounded-full shadow-sm transition-transform duration-(--duration-base) ease-(--motion-ease)"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option, i) => {
        const selected = i === index;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[i] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={option.description}
            onClick={() => choose(option.value)}
            className={cn(
              "focus-visible:ring-ring/50 relative z-10 min-w-12 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
