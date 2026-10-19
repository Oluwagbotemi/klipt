import type { DbOrTx } from "@/server/db";
import { mediaByIds } from "@/server/media";
import type { RichTextDoc, RichTextNode } from "@/lib/editor/rich-text";

/*
 * Before a body is rendered, images that came from the media library get the
 * file's current URL, alt text and size (so fixing alt text in Media fixes it
 * everywhere). Images whose file was deleted are removed.
 */

function collectIds(node: RichTextNode, ids: string[]) {
  if (node.type === "image" && typeof node.attrs?.mediaId === "string")
    ids.push(node.attrs.mediaId);
  node.content?.forEach((child) => collectIds(child, ids));
}

/** Makes /media/… URLs absolute, for websites that render the API's HTML. */
export function absoluteMediaUrl(url: string) {
  const origin = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  return url.startsWith("/") && origin ? `${origin}${url}` : url;
}

export async function resolveMediaInDoc(
  db: DbOrTx,
  siteId: string,
  doc: RichTextDoc,
  options: { absolute?: boolean } = {},
): Promise<RichTextDoc> {
  const ids: string[] = [];
  collectIds(doc, ids);
  if (ids.length === 0) return doc;
  const assets = await mediaByIds(db, siteId, ids);

  function visit(node: RichTextNode): RichTextNode[] {
    if (node.type === "image" && typeof node.attrs?.mediaId === "string") {
      const asset = assets.get(node.attrs.mediaId);
      if (!asset) return [];
      return [
        {
          ...node,
          attrs: {
            ...node.attrs,
            src: options.absolute ? absoluteMediaUrl(asset.url) : asset.url,
            alt: asset.altText ?? "",
            width: asset.width,
            height: asset.height,
          },
        },
      ];
    }
    return node.content ? [{ ...node, content: node.content.flatMap(visit) }] : [node];
  }
  return visit(doc)[0] as RichTextDoc;
}
