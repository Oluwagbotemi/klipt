import { z } from "zod";

/*
 * Draft previews on the customer's website (client-safe rules). Klipt never
 * fetches the preview address; it only sends the editor there with a
 * short-lived token that the website exchanges for the draft.
 */

/** How long a preview link works. */
export const PREVIEW_TTL_SECONDS = 60 * 60;

const isLocalHost = (host: string) =>
  host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

/**
 * "" clears the setting. Requires a full http(s) address without a username
 * or password; plain http is only accepted for local development addresses.
 */
export const previewUrlSchema = z
  .string()
  .trim()
  .max(2000, "Keep the address under 2,000 characters.")
  .transform((value, ctx) => {
    if (value === "") return null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a full address, e.g. https://myblog.com/api/preview.",
      });
      return z.NEVER;
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) {
      ctx.addIssue({
        code: "custom",
        message: "Use an address that starts with https:// (http:// only works for localhost).",
      });
      return z.NEVER;
    }
    if (url.username || url.password) {
      ctx.addIssue({
        code: "custom",
        message: "Remove the username and password from the address.",
      });
      return z.NEVER;
    }
    url.hash = "";
    return url.toString();
  });

/** The address the editor opens: the preview address plus token and page details. */
export function buildPreviewLink(
  previewUrl: string,
  params: { token: string; type: string; slug: string; path: string },
): string {
  const url = new URL(previewUrl);
  url.searchParams.set("token", params.token);
  url.searchParams.set("type", params.type);
  url.searchParams.set("slug", params.slug);
  url.searchParams.set("path", params.path);
  return url.toString();
}
