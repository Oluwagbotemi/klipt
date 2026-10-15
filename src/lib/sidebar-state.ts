"use client";

import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "@/lib/theme";

/*
 * Collapsed/expanded sidebar preference. The visual state is driven by CSS
 * from `data-sidebar` on <html> (set before paint), so this hook is only for
 * behaviour that depends on it, such as showing tooltips on the icon rail.
 */

const listeners = new Set<() => void>();

function isCollapsed() {
  return document.documentElement.dataset.sidebar === "collapsed";
}

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {}
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribe, isCollapsed, () => false);
}
