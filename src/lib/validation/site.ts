import { z } from "zod";

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Accepts "Example.com", "https://example.com/" etc. and returns "example.com". */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export const createSiteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a site name of at least 2 characters.")
    .max(80, "Keep the site name to 80 characters or fewer."),
  domain: z
    .string()
    .transform(normalizeDomain)
    .refine((value) => value === "" || HOSTNAME.test(value), {
      message: "Enter a domain like example.com, without spaces.",
    })
    .transform((value) => (value === "" ? null : value)),
});

export type CreateSiteInput = z.output<typeof createSiteSchema>;
