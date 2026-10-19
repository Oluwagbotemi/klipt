import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * File storage for the media library.
 *
 * - BLOB_READ_WRITE_TOKEN set (production): Vercel Blob. Files get public,
 *   unguessable URLs on Vercel's CDN.
 * - Otherwise, outside production: the local disk (MEDIA_DIR, default
 *   .data/media), served by the /media/[...key] route.
 * - Production without Blob: uploads are refused with StorageNotConfiguredError,
 *   because serverless disks are temporary.
 */

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "File storage isn't set up yet. In Vercel, open Storage, create a Blob store and connect it to this project.",
    );
  }
}

export interface Storage {
  /** Stores the file and returns its public URL. */
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
  delete(key: string, url: string): Promise<void>;
}

export function localMediaDir() {
  // Runtime data, not part of the build output (keeps file tracing from including the project).
  return (
    process.env.MEDIA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "media")
  );
}

/** Resolves a storage key inside the local media directory, refusing anything outside it. */
export function localPath(key: string): string | null {
  const root = path.resolve(/*turbopackIgnore: true*/ localMediaDir());
  const full = path.resolve(/*turbopackIgnore: true*/ root, key);
  return full.startsWith(root + path.sep) ? full : null;
}

export function createLocalStorage(): Storage {
  return {
    async put(key, data) {
      const file = localPath(key);
      if (!file) throw new Error("Invalid storage key.");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data, { flag: "wx" });
      return `/media/${key}`;
    },
    async delete(key) {
      const file = localPath(key);
      if (file) await rm(file, { force: true });
    },
  };
}

function createBlobStorage(token: string): Storage {
  return {
    async put(key, data, contentType) {
      const { put } = await import("@vercel/blob");
      const blob = await put(key, Buffer.from(data), {
        access: "public",
        contentType,
        token,
        addRandomSuffix: false,
        // Keys contain a random id, so files never change in place.
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      return blob.url;
    },
    async delete(_key, url) {
      const { del } = await import("@vercel/blob");
      await del(url, { token });
    },
  };
}

export function getStorage(): Storage {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) return createBlobStorage(token);
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_MEDIA) {
    throw new StorageNotConfiguredError();
  }
  return createLocalStorage();
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  const file = localPath(key);
  if (!file) return null;
  return readFile(file).catch(() => null);
}
