/** Returns `next` if it is a same-origin path, otherwise the fallback. Prevents open redirects. */
export function safeRedirectPath(next: string | null | undefined, fallback = "/sites"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
