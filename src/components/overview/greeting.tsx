"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function partOfDay() {
  const hour = new Date().getHours();
  return hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/**
 * "Good morning, Sam" in the viewer's own time of day. The server can't know it,
 * so it renders "Welcome back" and the browser swaps in the greeting.
 */
export function Greeting({ firstName }: { firstName: string }) {
  const part = useSyncExternalStore(subscribe, partOfDay, () => null);
  return (
    <>
      {part ? `Good ${part}` : "Welcome back"}
      {firstName ? `, ${firstName}` : ""}
    </>
  );
}
