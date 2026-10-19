import type { AcceptedType } from "@/lib/media";

/*
 * Identifies an uploaded file from its bytes (never from the name or the
 * browser-supplied type) and reads image dimensions. Only formats Klipt
 * accepts are recognized; anything else, including SVG, is rejected.
 */

export interface FileInfo {
  mimeType: AcceptedType;
  width: number | null;
  height: number | null;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function identifyFile(bytes: Uint8Array): FileInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return null;

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    if (bytes.length < 24) return null;
    return { mimeType: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return {
      mimeType: "image/gif",
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp", ...webpSize(bytes, view) };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mimeType: "image/jpeg", ...jpegSize(bytes, view) };
  }
  if (ascii(bytes, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 4))) {
    return { mimeType: "image/avif", ...avifSize(bytes, view) };
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return { mimeType: "application/pdf", width: null, height: null };
  }
  return null;
}

type Size = { width: number | null; height: number | null };
const unknown: Size = { width: null, height: null };

function webpSize(bytes: Uint8Array, view: DataView): Size {
  if (bytes.length < 30) return unknown;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const read24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  if (chunk === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return unknown;
}

/** JPEG size from the first SOF marker, swapped when EXIF says the photo is rotated. */
function jpegSize(bytes: Uint8Array, view: DataView): Size {
  let offset = 2;
  let rotated = false;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return unknown;
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === "Exif") {
      rotated = exifRotated(bytes, view, offset + 10);
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return rotated ? { width: height, height: width } : { width, height };
    }
    offset += 2 + length;
  }
  return unknown;
}

/** Whether the EXIF orientation (tag 0x0112) is one of the 90° rotations (5–8). */
function exifRotated(bytes: Uint8Array, view: DataView, tiff: number): boolean {
  try {
    const little = ascii(bytes, tiff, 2) === "II";
    const ifd = tiff + view.getUint32(tiff + 4, little);
    const entries = view.getUint16(ifd, little);
    for (let i = 0; i < entries; i++) {
      const entry = ifd + 2 + i * 12;
      if (view.getUint16(entry, little) === 0x0112) {
        const orientation = view.getUint16(entry + 8, little);
        return orientation >= 5 && orientation <= 8;
      }
    }
  } catch {
    // Malformed EXIF: fall back to the stored dimensions.
  }
  return false;
}

/** AVIF size from the first "ispe" (image spatial extents) property. */
function avifSize(bytes: Uint8Array, view: DataView): Size {
  const limit = Math.min(bytes.length - 16, 64 * 1024);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x69 && ascii(bytes, i, 4) === "ispe") {
      return { width: view.getUint32(i + 8), height: view.getUint32(i + 12) };
    }
  }
  return unknown;
}
