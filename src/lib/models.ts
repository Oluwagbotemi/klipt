import { z } from "zod";
import type { ContentFieldDefinition } from "@/server/db/schema";

export type { ContentFieldDefinition };

/*
 * Content models: field types, validation of model definitions and of the
 * values entries store for them (client-safe; the server re-validates).
 */

export const FIELD_TYPES = {
  text: { label: "Text", description: "A short line, e.g. a subtitle or SKU." },
  long_text: { label: "Long text", description: "A paragraph of plain text, e.g. a summary." },
  number: { label: "Number", description: "e.g. a price or a rating." },
  date: { label: "Date", description: "A calendar date, e.g. an event day." },
  boolean: { label: "Yes / no", description: "A switch, e.g. “In stock”." },
  select: { label: "Dropdown", description: "One choice from a list you define." },
  media: { label: "Image", description: "An image from the media library." },
  reference: { label: "Link to content", description: "Another entry, e.g. a related post." },
} as const;
export type FieldType = keyof typeof FIELD_TYPES;
export const FIELD_TYPE_KEYS = Object.keys(FIELD_TYPES) as FieldType[];

export const SCHEMA_TYPES = [
  "Thing",
  "Article",
  "BlogPosting",
  "NewsArticle",
  "WebPage",
  "Product",
  "Event",
  "Recipe",
  "Person",
  "Organization",
  "Place",
  "Course",
  "JobPosting",
  "Service",
  "FAQPage",
  "HowTo",
] as const;

/** Addresses Klipt or common websites already use; a model key becomes part of URLs. */
const RESERVED_MODEL_KEYS = new Set([
  "page",
  "pages",
  "post",
  "posts",
  "api",
  "media",
  "admin",
  "sites",
  "sitemap",
  "search",
  "preview",
  "static",
  "assets",
]);
/** Field keys that would clash with an entry's own properties in the API. */
const RESERVED_FIELD_KEYS = new Set([
  "id",
  "type",
  "title",
  "slug",
  "path",
  "url",
  "body",
  "seo",
  "status",
  "author",
  "excerpt",
  "fields",
]);

export const MAX_FIELDS = 40;
export const TEXT_MAX = 500;
export const LONG_TEXT_MAX = 10_000;

/** "Product Name!" → "product-name" (models, "-") or "product_name" (fields, "_"). */
export function keyFromLabel(label: string, separator: "-" | "_") {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, separator)
    .replace(/^[^a-z]+/, "")
    .slice(0, 40)
    .replace(/[-_]+$/, "");
}

export const modelDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the content type a name, e.g. Product.")
    .max(60, "Keep the name to 60 characters."),
  description: z
    .string()
    .trim()
    .max(200, "Keep the description to 200 characters.")
    .transform((value) => value || null),
  schemaType: z
    .string()
    .transform((value) => value || null)
    .refine((value) => value === null || (SCHEMA_TYPES as readonly string[]).includes(value), {
      message: "Choose a type from the list.",
    }),
});

export const modelKeySchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9-]{1,39}$/,
    "Use 2–40 lowercase letters, numbers and hyphens, starting with a letter.",
  )
  .refine((key) => !RESERVED_MODEL_KEYS.has(key), "That key is reserved. Choose another.");

export const newModelSchema = modelDetailsSchema.extend({ key: modelKeySchema });

export const fieldDefinitionSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]{0,39}$/,
        "Use lowercase letters, numbers and underscores, starting with a letter.",
      )
      .refine((key) => !RESERVED_FIELD_KEYS.has(key), "That key is reserved. Choose another."),
    label: z.string().trim().min(1, "Give the field a label.").max(60),
    type: z.enum(FIELD_TYPE_KEYS as [FieldType, ...FieldType[]]),
    required: z.boolean(),
    helpText: z.string().trim().max(200).optional(),
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    referenceModelKeys: z.array(z.string().max(40)).max(20).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "select") {
      const options = field.options ?? [];
      if (options.length === 0) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one choice." });
      } else if (new Set(options).size !== options.length) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "Choices must be different." });
      }
    }
    if (field.type === "reference" && !field.referenceModelKeys?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceModelKeys"],
        message: "Choose which content types it can link to.",
      });
    }
  })
  .transform((field): ContentFieldDefinition => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    ...(field.helpText ? { helpText: field.helpText } : {}),
    ...(field.type === "select" ? { options: field.options } : {}),
    ...(field.type === "reference" ? { referenceModelKeys: field.referenceModelKeys } : {}),
  }));

export const fieldListSchema = z
  .array(fieldDefinitionSchema)
  .max(MAX_FIELDS, `A content type can have up to ${MAX_FIELDS} fields.`)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `Two fields use the key “${field.key}”.`,
        });
      }
      seen.add(field.key);
    });
  });

/** A stored field value. Images and links store ids; the API resolves them. */
export type FieldValue = string | number | boolean;

export class FieldValueError extends Error {
  constructor(
    message: string,
    readonly fieldKey: string,
  ) {
    super(message);
  }
}

/**
 * Checks values against the model's fields. Empty values are left out
 * (drafts may be incomplete); unknown keys are dropped; wrong types throw.
 */
export function validateFieldValues(
  fields: ContentFieldDefinition[],
  raw: unknown,
): Record<string, FieldValue> {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === null || value === "") continue;
    const fail = (message: string): never => {
      throw new FieldValueError(`${field.label}: ${message}`, field.key);
    };
    switch (field.type) {
      case "text":
      case "long_text":
      case "rich_text": {
        if (typeof value !== "string") fail("Enter text.");
        const text = value as string;
        const max = field.type === "text" ? TEXT_MAX : LONG_TEXT_MAX;
        if (text.length > max) fail(`Keep it under ${max.toLocaleString("en")} characters.`);
        if (text.trim()) out[field.key] = text;
        break;
      }
      case "number": {
        const number = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(number)) fail("Enter a number.");
        out[field.key] = number;
        break;
      }
      case "date":
        if (
          typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(value))
        ) {
          fail("Enter a date.");
        }
        out[field.key] = value as string;
        break;
      case "boolean":
        if (typeof value !== "boolean") fail("Choose yes or no.");
        out[field.key] = value as boolean;
        break;
      case "select":
        if (typeof value !== "string" || !field.options?.includes(value)) {
          fail("Choose one of the options.");
        }
        out[field.key] = value as string;
        break;
      case "media":
      case "reference":
        if (typeof value !== "string" || !/^[\w-]{1,64}$/.test(value)) fail("Choose an item.");
        out[field.key] = value as string;
        break;
    }
  }
  return out;
}

/**
 * Reads stored values leniently: anything that no longer matches its field
 * (e.g. a dropdown choice that was removed) is left out instead of failing.
 */
export function readFieldValues(
  fields: ContentFieldDefinition[],
  data: Record<string, unknown>,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const field of fields) {
    try {
      Object.assign(out, validateFieldValues([field], data));
    } catch {
      // Skip values that don't fit the field any more.
    }
  }
  return out;
}

/** The first required field without a value, if any. */
export function firstMissingRequired(
  fields: ContentFieldDefinition[],
  values: Record<string, unknown>,
): ContentFieldDefinition | null {
  return (
    fields.find((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return value === undefined || value === null || value === "";
    }) ?? null
  );
}

export interface ModelSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  schemaType: string | null;
  isSystem: boolean;
  fields: ContentFieldDefinition[];
  entryCount: number;
  /** Version for optimistic locking when saving. */
  updatedAt: string;
}

/** A custom content type, as offered in "New" menus. */
export interface CollectionType {
  key: string;
  name: string;
}

/** An entry a "Link to content" field can point at. */
export interface LinkTarget {
  id: string;
  title: string;
  status: string;
  modelName: string;
  path: string;
}

/** Display data for field values that point at other records (editor only). */
export interface FieldRefs {
  media: Record<string, { url: string; altText: string | null; filename: string }>;
  entries: Record<string, { title: string; modelName: string; status: string }>;
}
