"use client";

import { useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyPreference, readPreference } from "@/components/theme-toggle";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match my device", icon: Monitor },
] as const;

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** Theme choice for this browser (stored locally, like the top bar's theme menu). */
export function AppearancePicker() {
  // The stored choice is only known in the browser; the server renders nothing selected.
  const stored = useSyncExternalStore(subscribe, readPreference, () => null);
  const [chosen, setChosen] = useState<ThemePreference | null>(null);
  const preference = chosen ?? stored;

  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          className="hover:bg-accent/50 has-focus-visible:ring-ring/50 has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm has-focus-visible:ring-[3px]"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => {
              setChosen(value);
              applyPreference(value);
            }}
            className="accent-primary size-4 shrink-0 outline-none"
          />
          <Icon className="text-muted-foreground size-4" aria-hidden />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
