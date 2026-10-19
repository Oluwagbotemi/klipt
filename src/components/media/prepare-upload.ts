import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media";

/*
 * Runs in the browser before upload. Large photos are resized (longest side
 * 2560 px) and re-encoded as WebP so they fit the upload limit and load fast
 * on the website. Smaller files are uploaded untouched.
 */

const MAX_EDGE = 2560;
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export type Prepared = { ok: true; file: File; resized: boolean } | { ok: false; error: string };

export async function prepareUpload(file: File): Promise<Prepared> {
  if (!(file.type in ACCEPTED_TYPES)) {
    return {
      ok: false,
      error: "This file type isn't supported. Use JPEG, PNG, WebP, GIF, AVIF or PDF.",
    };
  }
  if (file.size <= MAX_UPLOAD_BYTES) return { ok: true, file, resized: false };
  if (!RESIZABLE.has(file.type)) {
    return { ok: false, error: `This file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
        return { ok: true, file: new File([blob], name, { type: "image/webp" }), resized: true };
      }
    }
  } catch {
    // Fall through to the size error.
  }
  return { ok: false, error: `This image is too large even after resizing.` };
}
