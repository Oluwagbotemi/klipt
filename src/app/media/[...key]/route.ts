import { headers } from "next/headers";
import { readLocalFile } from "@/server/storage";
import { ACCEPTED_TYPES } from "@/lib/media";

/*
 * Serves media stored on the local disk (development, or self-hosting without
 * Vercel Blob). Keys contain a random id, so files are public but unguessable,
 * like Blob URLs. Production on Vercel serves files from Blob instead.
 */

const TYPES = new Map<string, string>(
  Object.entries(ACCEPTED_TYPES).map(([mime, { ext }]) => [ext, mime]),
);

export async function GET(_request: Request, context: RouteContext<"/media/[...key]">) {
  await headers();
  const { key } = await context.params;
  const path = key.join("/");
  const type = TYPES.get(path.split(".").pop()?.toLowerCase() ?? "");
  const file = type && key[0] === "sites" ? await readLocalFile(path) : null;
  if (!type || !file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // PDFs open in the browser but can't run scripts in Klipt's origin.
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
