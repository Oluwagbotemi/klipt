import type { ContentStatus, EntrySummary } from "@/lib/content";
import type { RichTextDoc } from "@/lib/editor/rich-text";
import type { ContentFieldDefinition, FieldRefs, FieldValue } from "@/lib/models";
import type { EntrySeoInput } from "@/lib/seo";

/** Everything the editor needs for one entry. */
export interface EntryDocument {
  entry: EntrySummary;
  body: RichTextDoc;
  seo: EntrySeoInput;
  /** schema.org type from the content model, e.g. "Article". */
  schemaType: string | null;
  path: string;
  /** The content type's own fields, their values and display data for linked records. */
  fields: ContentFieldDefinition[];
  values: Record<string, FieldValue>;
  refs: FieldRefs;
  /** Set when a reviewer sent the entry back with requested changes. */
  reviewFeedback: ReviewFeedback | null;
}

/** A reviewer's response (mirrors the review_feedback column). */
export interface ReviewFeedback {
  kind: "changes_requested";
  note: string;
  byId: string;
  byName: string;
  at: string;
}

/** An entry's version and lifecycle fields after a write. */
export interface EntryState {
  status: ContentStatus;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  slug: string;
}
