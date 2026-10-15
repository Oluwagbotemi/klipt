"use client";

import { useSyncExternalStore } from "react";

/*
 * Sites open as tabs in the top bar, with the last page visited in each.
 * A per-browser, per-account convenience kept in localStorage: it only stores
 * site ids and paths. Names, access and existence always come from the
 * server's list of the member's sites.
 */

export interface OpenSite {
  id: string;
  /** Last path visited in this site; always starts with /sites/<id>/. */
  path: string;
}

const EMPTY: OpenSite[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: OpenSite[] }>();

const storageKey = (userId: string) => `klipt-open-sites:${userId}`;

function isOpenSite(value: unknown): value is OpenSite {
  if (!value || typeof value !== "object") return false;
  const { id, path } = value as Record<string, unknown>;
  return typeof id === "string" && typeof path === "string" && path.startsWith(`/sites/${id}/`);
}

function read(userId: string): OpenSite[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(userId));
  } catch {}
  const cached = cache.get(userId);
  if (cached && cached.raw === raw) return cached.value;

  let value = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter(isOpenSite);
  } catch {}
  cache.set(userId, { raw, value });
  return value;
}

function write(userId: string, sites: OpenSite[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(sites));
  } catch {}
  listeners.forEach((listener) => listener());
}

/** Adds the site as a tab (at the end) or updates its last-visited path. */
export function rememberOpenSite(userId: string, id: string, path: string) {
  const sites = read(userId);
  const existing = sites.find((site) => site.id === id);
  if (existing?.path === path) return;
  write(
    userId,
    existing
      ? sites.map((site) => (site.id === id ? { id, path } : site))
      : [...sites, { id, path }],
  );
}

export function closeOpenSite(userId: string, id: string) {
  write(
    userId,
    read(userId).filter((site) => site.id !== id),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("klipt-open-sites:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useOpenSites(userId: string): OpenSite[] {
  return useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => EMPTY,
  );
}
