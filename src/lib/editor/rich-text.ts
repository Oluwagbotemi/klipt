import StarterKit from "@tiptap/starter-kit";

/*
 * Rich text: the body is stored as Tiptap (ProseMirror) JSON. The same
 * extension set drives the browser editor and server-side HTML rendering, and
 * sanitizeDoc() enforces it on every save, so stored content only ever
 * contains the nodes, marks and link targets listed here.
 */

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface RichTextDoc extends RichTextNode {
  type: "doc";
}

export const EMPTY_DOC: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** http(s), mailto, tel, or a site-relative path / fragment. */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length > 2048) return false;
  const value = href.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export const HEADING_LEVELS = [2, 3, 4] as const;

export function richTextExtensions() {
  return [
    StarterKit.configure({
      // The entry title is the page's only H1.
      heading: { levels: [...HEADING_LEVELS] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer", target: null },
      },
    }),
  ];
}

const NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
]);
const MARK_TYPES = new Set(["bold", "italic", "strike", "underline", "code", "link"]);
const MAX_NODES = 20_000;
const MAX_DEPTH = 24;
const MAX_TEXT = 200_000;

export class InvalidRichTextError extends Error {}

/**
 * Rebuilds a document keeping only allowed nodes, marks and attributes.
 * Unknown nodes are dropped (their text is kept when possible); unsafe links
 * lose their link mark. Throws for structurally invalid or oversized input.
 */
export function sanitizeDoc(input: unknown): RichTextDoc {
  let nodes = 0;
  let textLength = 0;

  function clean(node: unknown, depth: number): RichTextNode[] {
    if (!node || typeof node !== "object") return [];
    if (depth > MAX_DEPTH) throw new InvalidRichTextError("Content is nested too deeply.");
    if (++nodes > MAX_NODES) throw new InvalidRichTextError("Content is too long.");
    const raw = node as RichTextNode;

    const children = Array.isArray(raw.content)
      ? raw.content.flatMap((child) => clean(child, depth + 1))
      : [];

    if (!NODE_TYPES.has(raw.type)) return children; // unwrap unknown wrappers

    if (raw.type === "text") {
      if (typeof raw.text !== "string" || raw.text.length === 0) return [];
      textLength += raw.text.length;
      if (textLength > MAX_TEXT) throw new InvalidRichTextError("Content is too long.");
      const marks = (Array.isArray(raw.marks) ? raw.marks : []).flatMap((mark) => {
        if (!mark || !MARK_TYPES.has(mark.type)) return [];
        if (mark.type === "link") {
          const href = mark.attrs?.href;
          return isSafeHref(href) ? [{ type: "link", attrs: { href: href.trim() } }] : [];
        }
        return [{ type: mark.type }];
      });
      return [{ type: "text", text: raw.text, ...(marks.length ? { marks } : {}) }];
    }

    const out: RichTextNode = { type: raw.type };
    if (raw.type === "heading") {
      const level = Number(raw.attrs?.level);
      out.attrs = { level: (HEADING_LEVELS as readonly number[]).includes(level) ? level : 2 };
    } else if (raw.type === "orderedList") {
      const start = Number(raw.attrs?.start);
      out.attrs = { start: Number.isInteger(start) && start > 0 && start < 100_000 ? start : 1 };
    } else if (raw.type === "codeBlock") {
      const language = raw.attrs?.language;
      out.attrs = {
        language:
          typeof language === "string" && /^[a-z0-9+#-]{1,30}$/i.test(language) ? language : null,
      };
    }

    if (raw.type === "horizontalRule" || raw.type === "hardBreak") return [out];
    if (raw.type === "listItem" && children.length === 0) {
      out.content = [{ type: "paragraph" }];
      return [out];
    }
    if (children.length) out.content = children;
    return [out];
  }

  if (!input || typeof input !== "object" || (input as RichTextNode).type !== "doc") {
    throw new InvalidRichTextError("Content must be a document.");
  }
  const [doc] = clean(input, 0) as RichTextDoc[];
  return doc.content?.length ? doc : EMPTY_DOC;
}

/** Plain text of a document, for word counts and descriptions. */
export function docToText(doc: RichTextNode): string {
  if (doc.type === "text") return doc.text ?? "";
  const parts = (doc.content ?? []).map(docToText);
  const block = ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(doc.type);
  return parts.join(block ? "" : " ") + (block ? "\n" : "");
}

export function wordCount(doc: RichTextNode): number {
  return docToText(doc).split(/\s+/).filter(Boolean).length;
}
