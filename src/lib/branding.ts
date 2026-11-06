/* Site branding (Settings › General › Brand): shared rules, client-safe. */

export type BrandSlot = "logo" | "favicon";

export const BRAND_SLOTS: BrandSlot[] = ["logo", "favicon"];

export const BRAND_LABELS: Record<BrandSlot, string> = {
  logo: "Site logo",
  favicon: "Site favicon",
};

/** Favicons are shown tiny; smaller sources look blurry on high-density screens. */
export const FAVICON_MIN_PX = 48;
export const FAVICON_IDEAL_PX = 512;

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
/** Browsers show PNG and WebP favicons everywhere; JPEG can't be transparent. */
const FAVICON_TYPES = ["image/png", "image/webp"];

export interface BrandImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface SiteBranding {
  logo: BrandImage | null;
  favicon: BrandImage | null;
}

/** Why this file can't be used for the slot, or null when it can. */
export function brandImageError(
  slot: BrandSlot,
  file: { mimeType: string; width: number | null; height: number | null },
): string | null {
  if (slot === "logo") {
    return LOGO_TYPES.includes(file.mimeType)
      ? null
      : "Use a PNG, JPEG, WebP, GIF or AVIF image for the logo.";
  }
  if (!FAVICON_TYPES.includes(file.mimeType)) return "Use a PNG or WebP image for the favicon.";
  if (!file.width || !file.height) return "Klipt couldn't read this image's size. Try a PNG.";
  if (Math.min(file.width, file.height) < FAVICON_MIN_PX) {
    return `The favicon needs to be at least ${FAVICON_MIN_PX} × ${FAVICON_MIN_PX} pixels; this one is ${file.width} × ${file.height}.`;
  }
  return null;
}

/** Gentle advice that doesn't block saving (e.g. a favicon that isn't square). */
export function brandImageNote(slot: BrandSlot, image: BrandImage | null): string | null {
  if (!image?.width || !image.height) return null;
  if (slot === "favicon") {
    const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
    if (ratio > 1.1) return "This favicon isn't square, so browsers will squeeze or pad it.";
    if (Math.min(image.width, image.height) < FAVICON_IDEAL_PX) {
      return `Works, but ${FAVICON_IDEAL_PX} × ${FAVICON_IDEAL_PX} pixels looks sharper on phones and home screens.`;
    }
  }
  return null;
}
