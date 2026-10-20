import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, contentEntries, mediaAssets, siteMembers, users } from "@/server/db/schema";
import { applyBulkAction, createEntry } from "@/server/content";
import { getDeliverySite, getPublishedEntry, listPublished } from "@/server/delivery";
import {
  EditorValidationError,
  getEntryDocument,
  saveEntry,
  transitionEntry,
} from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import {
  createModel,
  deleteModel,
  getModel,
  listModels,
  ModelConflictError,
  ModelInUseError,
  ModelValidationError,
  saveModelFields,
  searchLinkTargets,
  updateModelDetails,
} from "@/server/models";
import { createSite } from "@/server/sites";
import {
  fieldListSchema,
  FieldValueError,
  firstMissingRequired,
  keyFromLabel,
  modelKeySchema,
  readFieldValues,
  validateFieldValues,
  type ContentFieldDefinition,
} from "@/lib/models";

process.env.BETTER_AUTH_URL = "https://cms.example";

let db: Database;
let siteId: string;
let otherSiteId: string;

const PRODUCT_FIELDS: ContentFieldDefinition[] = [
  { key: "price", label: "Price", type: "number", required: true },
  { key: "tagline", label: "Tagline", type: "text", required: false, helpText: "One line." },
  { key: "details", label: "Details", type: "long_text", required: false },
  { key: "launch", label: "Launch date", type: "date", required: false },
  { key: "in_stock", label: "In stock", type: "boolean", required: false },
  { key: "size", label: "Size", type: "select", required: false, options: ["S", "M", "L"] },
  { key: "photo", label: "Photo", type: "media", required: false },
  {
    key: "review",
    label: "Review",
    type: "reference",
    required: false,
    referenceModelKeys: ["post"],
  },
];

async function doc(entryId: string, userId = "owner") {
  const d = await getEntryDocument(db, userId, siteId, entryId);
  assert.ok(d);
  return d;
}

async function modelByKey(key: string, inSite = siteId) {
  const model = (await listModels(db, "owner", inSite)).find((item) => item.key === key);
  assert.ok(model);
  return model;
}

async function addMedia(inSite: string, mimeType = "image/png") {
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      siteId: inSite,
      storageKey: `sites/${inSite}/${crypto.randomUUID()}/photo.png`,
      url: `/media/sites/${inSite}/photo.png`,
      filename: "photo.png",
      mimeType,
      sizeBytes: 100,
      width: 800,
      height: 600,
      altText: "A red kettle",
      uploadedById: "owner",
    })
    .returning({ id: mediaAssets.id });
  return asset.id;
}

async function publish(entryId: string, userId = "owner") {
  return transitionEntry(db, userId, siteId, entryId, {
    action: "publish",
    expectedUpdatedAt: (await doc(entryId, userId)).entry.updatedAt,
  });
}

async function saveFields(entryId: string, fields: Record<string, unknown>, userId = "owner") {
  const d = await doc(entryId, userId);
  return saveEntry(db, userId, siteId, entryId, {
    title: d.entry.title,
    body: d.body,
    seo: d.seo,
    fields,
    expectedUpdatedAt: d.entry.updatedAt,
  });
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Shop", domain: "shop.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("model rules (client-safe)", () => {
  test("keys come from labels and reserved or malformed keys are refused", () => {
    assert.equal(keyFromLabel("Product Name!", "-"), "product-name");
    assert.equal(keyFromLabel("  2nd Hand  Item ", "_"), "nd_hand_item");
    assert.equal(keyFromLabel("Café Menu", "-"), "cafe-menu");
    assert.equal(modelKeySchema.safeParse("products").success, true);
    for (const bad of ["posts", "page", "api", "P", "1abc", "a", "has space", "x".repeat(41)]) {
      assert.equal(modelKeySchema.safeParse(bad).success, false, bad);
    }
  });

  test("field lists need unique keys, choices for dropdowns and targets for links", () => {
    assert.equal(fieldListSchema.safeParse(PRODUCT_FIELDS).success, true);
    const dup = fieldListSchema.safeParse([
      PRODUCT_FIELDS[0],
      { ...PRODUCT_FIELDS[1], key: "price" },
    ]);
    assert.equal(dup.success, false);
    const reserved = fieldListSchema.safeParse([{ ...PRODUCT_FIELDS[1], key: "slug" }]);
    assert.equal(reserved.success, false);
    const noOptions = fieldListSchema.safeParse([{ ...PRODUCT_FIELDS[5], options: [] }]);
    assert.equal(noOptions.success, false);
    const noTargets = fieldListSchema.safeParse([{ ...PRODUCT_FIELDS[7], referenceModelKeys: [] }]);
    assert.equal(noTargets.success, false);
    // Properties that don't belong to the type are dropped.
    const parsed = fieldListSchema.parse([{ ...PRODUCT_FIELDS[0], options: ["x"] }]);
    assert.equal("options" in parsed[0], false);
  });

  test("values are checked per type; empty values and unknown keys are dropped", () => {
    const values = validateFieldValues(PRODUCT_FIELDS, {
      price: 12.5,
      tagline: "",
      details: "Long story",
      launch: "2026-11-01",
      in_stock: false,
      size: "M",
      photo: "abc123",
      review: "entry-1",
      hacker: "<script>",
    });
    assert.deepEqual(values, {
      price: 12.5,
      details: "Long story",
      launch: "2026-11-01",
      in_stock: false,
      size: "M",
      photo: "abc123",
      review: "entry-1",
    });
    assert.deepEqual(validateFieldValues(PRODUCT_FIELDS, { price: "7" }), { price: 7 });
    const bad: [string, unknown][] = [
      ["price", "lots"],
      ["tagline", "x".repeat(501)],
      ["tagline", 5],
      ["launch", "tomorrow"],
      ["in_stock", "yes"],
      ["size", "XL"],
      ["photo", "../etc/passwd"],
      ["review", { id: 1 }],
    ];
    for (const [key, value] of bad) {
      assert.throws(
        () => validateFieldValues(PRODUCT_FIELDS, { [key]: value }),
        (error) => error instanceof FieldValueError && error.fieldKey === key,
        key,
      );
    }
    assert.deepEqual(readFieldValues(PRODUCT_FIELDS, { price: 3, size: "XL" }), { price: 3 });
    assert.equal(firstMissingRequired(PRODUCT_FIELDS, {})?.key, "price");
    assert.equal(firstMissingRequired(PRODUCT_FIELDS, { price: 0 }), null);
  });
});

describe("content models", () => {
  test("built-in Page and Post are listed with entry counts", async () => {
    await createEntry(db, "owner", siteId, "page", "About");
    const models = await listModels(db, "viewer", siteId);
    assert.deepEqual(
      models.map((model) => [model.key, model.isSystem]),
      [
        ["page", true],
        ["post", true],
      ],
    );
    assert.equal(models[0].entryCount, 1);
    await assert.rejects(listModels(db, "stranger", siteId), NotAllowedError);
  });

  test("only owners and admins create models; keys are unique and validated", async () => {
    for (const userId of ["editor", "author", "viewer", "stranger"]) {
      await assert.rejects(
        createModel(db, userId, siteId, {
          name: "Product",
          key: "product",
          description: "",
          schemaType: "",
        }),
        NotAllowedError,
        userId,
      );
    }
    const { id } = await createModel(db, "admin", siteId, {
      name: "Product",
      key: "product",
      description: "Things we sell",
      schemaType: "Product",
    });
    const model = await getModel(db, "viewer", siteId, id);
    assert.equal(model?.key, "product");
    assert.equal(model?.schemaType, "Product");
    assert.equal(model?.entryCount, 0);

    await assert.rejects(
      createModel(db, "owner", siteId, {
        name: "Again",
        key: "product",
        description: "",
        schemaType: "",
      }),
      (error) => error instanceof ModelValidationError && error.field === "key",
    );
    await assert.rejects(
      createModel(db, "owner", siteId, {
        name: "P",
        key: "posts",
        description: "",
        schemaType: "",
      }),
      ModelValidationError,
    );
    await assert.rejects(
      createModel(db, "owner", siteId, {
        name: "Thing",
        key: "thing",
        description: "",
        schemaType: "Spaceship",
      }),
      (error) => error instanceof ModelValidationError && error.field === "schemaType",
    );
    // The same key is fine on another site.
    await createModel(db, "stranger", otherSiteId, {
      name: "Product",
      key: "product",
      description: "",
      schemaType: "",
    });
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.targetId, id), eq(auditEvents.action, "model.created")));
    assert.equal(audit.actorId, "admin");
  });

  test("details update with optimistic locking; built-in names stay", async () => {
    const product = await modelByKey("product");
    await assert.rejects(
      updateModelDetails(db, "editor", siteId, product.id, {
        name: "Products",
        description: "",
        schemaType: "",
        expectedUpdatedAt: product.updatedAt,
      }),
      NotAllowedError,
    );
    const { updatedAt } = await updateModelDetails(db, "owner", siteId, product.id, {
      name: "Product item",
      description: "Things we sell",
      schemaType: "Product",
      expectedUpdatedAt: product.updatedAt,
    });
    assert.notEqual(updatedAt, product.updatedAt);
    await assert.rejects(
      updateModelDetails(db, "owner", siteId, product.id, {
        name: "Stale",
        description: "",
        schemaType: "",
        expectedUpdatedAt: product.updatedAt,
      }),
      ModelConflictError,
    );
    const post = await modelByKey("post");
    await updateModelDetails(db, "owner", siteId, post.id, {
      name: "Article",
      description: "Blog posts",
      schemaType: "BlogPosting",
      expectedUpdatedAt: post.updatedAt,
    });
    const after = await modelByKey("post");
    assert.equal(after.name, "Post");
    assert.equal(after.schemaType, "BlogPosting");
  });

  test("fields: save, reorder, immutable types, linked types must exist", async () => {
    let product = await modelByKey("product");
    await assert.rejects(
      saveModelFields(db, "author", siteId, product.id, {
        fields: PRODUCT_FIELDS,
        expectedUpdatedAt: product.updatedAt,
      }),
      NotAllowedError,
    );
    await assert.rejects(
      saveModelFields(db, "owner", siteId, product.id, {
        fields: [{ ...PRODUCT_FIELDS[7], referenceModelKeys: ["nope"] }],
        expectedUpdatedAt: product.updatedAt,
      }),
      ModelValidationError,
    );
    await saveModelFields(db, "owner", siteId, product.id, {
      fields: [...PRODUCT_FIELDS].reverse(),
      expectedUpdatedAt: product.updatedAt,
    });
    product = await modelByKey("product");
    assert.equal(product.fields[0].key, "review");
    const { fields } = await saveModelFields(db, "owner", siteId, product.id, {
      fields: PRODUCT_FIELDS,
      expectedUpdatedAt: product.updatedAt,
    });
    assert.deepEqual(
      fields.map((field) => field.key),
      PRODUCT_FIELDS.map((field) => field.key),
    );
    product = await modelByKey("product");
    await assert.rejects(
      saveModelFields(db, "owner", siteId, product.id, {
        fields: [{ ...PRODUCT_FIELDS[0], type: "text" }],
        expectedUpdatedAt: product.updatedAt,
      }),
      /type can't change/,
    );
    // Built-in types can get extra fields too.
    const post = await modelByKey("post");
    await saveModelFields(db, "admin", siteId, post.id, {
      fields: [{ key: "subtitle", label: "Subtitle", type: "text", required: false }],
      expectedUpdatedAt: post.updatedAt,
    });
    assert.equal((await modelByKey("post")).fields.length, 1);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.targetId, product.id), eq(auditEvents.action, "model.fields_updated")),
      );
    assert.equal(audits.length, 2);
  });
});

describe("entries of custom models", () => {
  let productId: string;
  let reviewId: string;
  let draftPostId: string;
  let photoId: string;

  test("entries are created and validated against the model", async () => {
    productId = (await createEntry(db, "author", siteId, "product", "Red kettle")).id;
    assert.equal((await doc(productId, "author")).path, `/product/red-kettle`);
    reviewId = (await createEntry(db, "owner", siteId, "post", "Kettle review")).id;
    await publish(reviewId);
    draftPostId = (await createEntry(db, "owner", siteId, "post", "Draft thoughts")).id;
    photoId = await addMedia(siteId);
    const pdfId = await addMedia(siteId, "application/pdf");
    const foreignPhoto = await addMedia(otherSiteId);
    const pageId = (await createEntry(db, "owner", siteId, "page", "Contact")).id;

    // Drafts may leave required fields empty.
    await saveFields(productId, { tagline: "Boils fast" }, "author");
    assert.deepEqual((await doc(productId)).values, { tagline: "Boils fast" });

    const rejects = async (fields: Record<string, unknown>, key: string) =>
      assert.rejects(
        saveFields(productId, fields),
        (error) =>
          error instanceof EditorValidationError &&
          error.field === "fields" &&
          error.fieldKey === key,
      );
    await rejects({ size: "XXL" }, "size");
    await rejects({ photo: pdfId }, "photo");
    await rejects({ photo: foreignPhoto }, "photo");
    await rejects({ review: pageId }, "review");
    await rejects({ review: "missing" }, "review");

    await saveFields(productId, {
      price: 49,
      tagline: "Boils fast",
      size: "M",
      in_stock: true,
      photo: photoId,
      review: reviewId,
      unknown: "dropped",
    });
    const saved = await doc(productId);
    assert.equal(saved.values.price, 49);
    assert.equal("unknown" in saved.values, false);
    assert.equal(saved.refs.media[photoId].altText, "A red kettle");
    assert.equal(saved.refs.entries[reviewId].title, "Kettle review");
    const [row] = await db.select().from(contentEntries).where(eq(contentEntries.id, productId));
    assert.equal(row.data.unknown, undefined);
  });

  test("publishing needs required fields", async () => {
    const emptyId = (await createEntry(db, "owner", siteId, "product", "Blue kettle")).id;
    await assert.rejects(
      publish(emptyId),
      (error) =>
        error instanceof EditorValidationError &&
        error.fieldKey === "price" &&
        /Price/.test(error.message),
    );
    await assert.rejects(
      transitionEntry(db, "owner", siteId, emptyId, {
        action: "schedule",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        expectedUpdatedAt: (await doc(emptyId)).entry.updatedAt,
      }),
      EditorValidationError,
    );
    await saveFields(emptyId, { price: 0 });
    await publish(emptyId);
    await publish(productId);
  });

  test("the link picker lists entries of the allowed types only", async () => {
    const targets = await searchLinkTargets(db, "author", siteId, {
      modelKeys: ["post"],
      q: "kettle",
    });
    assert.deepEqual(
      targets.map((target) => target.title),
      ["Kettle review"],
    );
    const all = await searchLinkTargets(db, "author", siteId, { modelKeys: ["post"], q: "" });
    assert.equal(all.length, 2);
    await assert.rejects(
      searchLinkTargets(db, "stranger", siteId, { modelKeys: ["post"], q: "" }),
      NotAllowedError,
    );
  });

  test("the content API returns fields with images and published links resolved", async () => {
    const site = await getDeliverySite(db, siteId);
    assert.ok(site);
    const entry = await getPublishedEntry(db, site, "product", "red-kettle");
    assert.ok(entry);
    assert.deepEqual(entry.fields, {
      price: 49,
      tagline: "Boils fast",
      details: null,
      launch: null,
      in_stock: true,
      size: "M",
      photo: {
        url: `https://cms.example/media/sites/${siteId}/photo.png`,
        alt: "A red kettle",
        width: 800,
        height: 600,
      },
      review: {
        id: reviewId,
        type: "post",
        title: "Kettle review",
        slug: "kettle-review",
        path: "/posts/kettle-review",
      },
    });

    const list = await listPublished(db, site, { type: "product", page: 1, limit: 20 });
    assert.equal(list.total, 2);
    const item = list.items.find((summary) => summary.id === productId);
    assert.equal((item?.fields.photo as { alt: string }).alt, "A red kettle");
    assert.equal(item?.path, "/product/red-kettle");

    // Linking to an entry that isn't published returns null.
    const productModel = await modelByKey("product");
    await saveModelFields(db, "owner", siteId, productModel.id, {
      fields: productModel.fields.map((field) =>
        field.key === "review" ? { ...field, referenceModelKeys: ["post", "page"] } : field,
      ),
      expectedUpdatedAt: productModel.updatedAt,
    });
    await saveFields(productId, {
      ...(await doc(productId)).values,
      review: draftPostId,
    });
    const again = await getPublishedEntry(db, site, "product", "red-kettle");
    assert.equal(again?.fields.review, null);
    // The other site sees nothing of this one.
    const other = await getDeliverySite(db, otherSiteId);
    assert.ok(other);
    assert.equal(
      (await listPublished(db, other, { type: "product", page: 1, limit: 20 })).total,
      0,
    );
  });

  test("a model can only be deleted when nothing uses it", async () => {
    const product = await modelByKey("product");
    const post = await modelByKey("post");
    await assert.rejects(deleteModel(db, "owner", siteId, post.id), /Built-in/);
    await assert.rejects(deleteModel(db, "editor", siteId, product.id), NotAllowedError);
    await assert.rejects(
      deleteModel(db, "owner", siteId, product.id),
      (error) => error instanceof ModelInUseError && /2 entries/.test(error.message),
    );

    // A type linked from another type's field can't be deleted either.
    const { id: brandId } = await createModel(db, "owner", siteId, {
      name: "Brand",
      key: "brand",
      description: "",
      schemaType: "",
    });
    await saveModelFields(db, "owner", siteId, product.id, {
      fields: [
        ...product.fields,
        {
          key: "brand",
          label: "Brand",
          type: "reference",
          required: false,
          referenceModelKeys: ["brand"],
        },
      ],
      expectedUpdatedAt: product.updatedAt,
    });
    await assert.rejects(deleteModel(db, "owner", siteId, brandId), /links to Brand/);

    const entries = await db
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(eq(contentEntries.modelId, product.id));
    const entryIds = entries.map((entry) => entry.id);
    await applyBulkAction(db, "owner", siteId, entryIds, "archive");
    await applyBulkAction(db, "owner", siteId, entryIds, "delete");
    await deleteModel(db, "admin", siteId, product.id);
    assert.equal(await getModel(db, "owner", siteId, product.id), null);
    await deleteModel(db, "owner", siteId, brandId);
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.targetId, product.id), eq(auditEvents.action, "model.deleted")));
    assert.equal(audit.actorId, "admin");
  });
});
