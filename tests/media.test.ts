import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteMembers, users } from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { getDeliverySite, getPublishedEntry } from "@/server/delivery";
import { getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { identifyFile } from "@/server/file-type";
import {
  deleteMedia,
  getMediaAsset,
  listMedia,
  updateMediaDetails,
  uploadMedia,
  UploadError,
} from "@/server/media";
import { resolveMediaInDoc } from "@/server/media-render";
import { createLocalStorage, localPath, type Storage } from "@/server/storage";
import { createSite } from "@/server/sites";
import { sanitizeDoc } from "@/lib/editor/rich-text";
import { MAX_UPLOAD_BYTES, parseMediaListParams } from "@/lib/media";

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "klipt-media-"));
process.env.BETTER_AUTH_URL = "https://cms.example";

let db: Database;
let storage: Storage;
let siteId: string;
let otherSiteId: string;

// ---- Minimal valid files ---------------------------------------------------

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
function gif(width: number, height: number) {
  const bytes = new Uint8Array(16);
  bytes.set([...Buffer.from("GIF89a")]);
  new DataView(bytes.buffer).setUint16(6, width, true);
  new DataView(bytes.buffer).setUint16(8, height, true);
  return bytes;
}
/** JPEG with an EXIF orientation tag and a SOF0 marker for width x height. */
function jpeg(width: number, height: number, orientation = 1) {
  const exif = [
    ...Buffer.from("Exif\0\0"),
    ...Buffer.from("MM"),
    0,
    42,
    0,
    0,
    0,
    8, // TIFF header, IFD at 8
    0,
    1, // one entry
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0, // orientation (SHORT)
    0,
    0,
    0,
    0,
  ];
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif];
  const sof = [
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    3,
    ...new Array(9).fill(0),
  ];
  return Uint8Array.from([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
}
const pdf = () => Uint8Array.from(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n"));
const svg = () =>
  Uint8Array.from(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  );

const params = (query: Record<string, string> = {}) => parseMediaListParams(query);

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  storage = createLocalStorage();
  for (const id of ["owner", "editor", "author", "author2", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Site", domain: "site.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "author2", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("file identification", () => {
  test("recognizes formats from bytes and reads dimensions", () => {
    assert.deepEqual(identifyFile(png(640, 480)), {
      mimeType: "image/png",
      width: 640,
      height: 480,
    });
    assert.deepEqual(identifyFile(gif(20, 10)), { mimeType: "image/gif", width: 20, height: 10 });
    assert.deepEqual(identifyFile(jpeg(1200, 800)), {
      mimeType: "image/jpeg",
      width: 1200,
      height: 800,
    });
    assert.equal(identifyFile(pdf())?.mimeType, "application/pdf");
  });

  test("swaps dimensions for rotated phone photos", () => {
    assert.deepEqual(identifyFile(jpeg(4000, 3000, 6)), {
      mimeType: "image/jpeg",
      width: 3000,
      height: 4000,
    });
  });

  test("rejects SVG and unknown files", () => {
    assert.equal(identifyFile(svg()), null);
    assert.equal(identifyFile(Uint8Array.from(Buffer.from("hello world, not a file"))), null);
  });
});

describe("uploads", () => {
  test("stores the file under a safe, unique key and records it", async () => {
    const asset = await uploadMedia(db, storage, "author", siteId, {
      name: "Harbour Seals (1).PNG",
      bytes: png(800, 600),
    });
    assert.equal(asset.mimeType, "image/png");
    assert.equal(asset.width, 800);
    assert.equal(asset.filename, "Harbour Seals (1).PNG");
    assert.match(
      asset.url,
      new RegExp(`^/media/sites/${siteId}/[0-9a-f-]{36}/harbour-seals-1\\.png$`),
    );
    const file = localPath(asset.url.replace(/^\/media\//, ""));
    assert.ok(file && existsSync(file));
    assert.deepEqual([...readFileSync(file)], [...png(800, 600)]);
  });

  test("uses the real file type, not the name", async () => {
    const asset = await uploadMedia(db, storage, "owner", siteId, {
      name: "doc.png",
      bytes: pdf(),
    });
    assert.equal(asset.mimeType, "application/pdf");
    assert.match(asset.url, /\/doc\.pdf$/);
  });

  test("rejects unsupported, empty and oversized files", async () => {
    await assert.rejects(
      uploadMedia(db, storage, "owner", siteId, { name: "x.svg", bytes: svg() }),
      UploadError,
    );
    await assert.rejects(
      uploadMedia(db, storage, "owner", siteId, { name: "e.png", bytes: new Uint8Array() }),
      UploadError,
    );
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(png(1, 1));
    await assert.rejects(
      uploadMedia(db, storage, "owner", siteId, { name: "big.png", bytes: big }),
      UploadError,
    );
  });

  test("viewers and non-members can't upload", async () => {
    await assert.rejects(
      uploadMedia(db, storage, "viewer", siteId, { name: "a.png", bytes: png(1, 1) }),
      NotAllowedError,
    );
    await assert.rejects(
      uploadMedia(db, storage, "stranger", siteId, { name: "a.png", bytes: png(1, 1) }),
      NotAllowedError,
    );
  });

  test("storage keys can't escape the media folder", () => {
    assert.equal(localPath("../../etc/passwd"), null);
    assert.equal(localPath("sites/../../x"), null);
    assert.ok(localPath("sites/a/b.png"));
  });
});

describe("managing files", () => {
  test("authors manage their own uploads; editors manage any; viewers none", async () => {
    const mine = await uploadMedia(db, storage, "author", siteId, {
      name: "a.gif",
      bytes: gif(5, 5),
    });
    const details = { altText: "A seal on a rock", caption: "" };
    await updateMediaDetails(db, "author", siteId, mine.id, details);
    await assert.rejects(
      updateMediaDetails(db, "author2", siteId, mine.id, details),
      NotAllowedError,
    );
    await assert.rejects(
      updateMediaDetails(db, "viewer", siteId, mine.id, details),
      NotAllowedError,
    );
    await updateMediaDetails(db, "editor", siteId, mine.id, {
      altText: " Seal ",
      caption: "Spring",
    });
    const fresh = await getMediaAsset(db, "viewer", siteId, mine.id);
    assert.equal(fresh?.altText, "Seal");
    assert.equal(fresh?.caption, "Spring");
    assert.equal(fresh?.uploadedByName, "User author");
  });

  test("other sites can't see or change files", async () => {
    const asset = await uploadMedia(db, storage, "owner", siteId, {
      name: "s.png",
      bytes: png(2, 2),
    });
    await assert.rejects(getMediaAsset(db, "stranger", siteId, asset.id), NotAllowedError);
    assert.equal(await getMediaAsset(db, "stranger", otherSiteId, asset.id), null);
    assert.deepEqual(await deleteMedia(db, storage, "stranger", otherSiteId, [asset.id]), {
      deleted: 0,
      skipped: 1,
    });
  });

  test("delete removes the record and the stored file, skipping what isn't allowed", async () => {
    const own = await uploadMedia(db, storage, "author", siteId, {
      name: "d.png",
      bytes: png(3, 3),
    });
    const others = await uploadMedia(db, storage, "owner", siteId, {
      name: "o.png",
      bytes: png(3, 3),
    });
    const result = await deleteMedia(db, storage, "author", siteId, [own.id, others.id]);
    assert.deepEqual(result, { deleted: 1, skipped: 1 });
    assert.equal(await getMediaAsset(db, "owner", siteId, own.id), null);
    assert.equal(existsSync(localPath(own.url.replace(/^\/media\//, ""))!), false);
    assert.ok(await getMediaAsset(db, "owner", siteId, others.id));
  });

  test("lists with type, alt text, search and sort filters", async () => {
    const listSite = (await createSite(db, "owner", { name: "List", domain: null })).id;
    const a = await uploadMedia(db, storage, "owner", listSite, {
      name: "beach.png",
      bytes: png(10, 10),
    });
    await uploadMedia(db, storage, "owner", listSite, { name: "Menu.pdf", bytes: pdf() });
    await uploadMedia(db, storage, "owner", listSite, { name: "aardvark.gif", bytes: gif(1, 1) });
    await updateMediaDetails(db, "owner", listSite, a.id, { altText: "Sunny beach", caption: "" });

    const all = await listMedia(db, "owner", listSite, "all", params());
    assert.deepEqual(all.counts, { all: 3, images: 2, files: 1, missingAlt: 1 });
    assert.deepEqual(
      (await listMedia(db, "owner", listSite, "files", params())).items.map((i) => i.filename),
      ["Menu.pdf"],
    );
    assert.deepEqual(
      (await listMedia(db, "owner", listSite, "all", params({ alt: "missing" }))).items.map(
        (i) => i.filename,
      ),
      ["aardvark.gif"],
    );
    assert.deepEqual(
      (await listMedia(db, "owner", listSite, "all", params({ q: "sunny" }))).items.map(
        (i) => i.filename,
      ),
      ["beach.png"],
    );
    assert.deepEqual(
      (await listMedia(db, "owner", listSite, "all", params({ sort: "name" }))).items.map(
        (i) => i.filename,
      ),
      ["aardvark.gif", "beach.png", "Menu.pdf"],
    );
  });
});

describe("images in content", () => {
  test("sanitizer keeps safe library images and drops unsafe ones", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "/media/sites/x/y/a.png",
            alt: "A",
            mediaId: "abc-1",
            width: "640",
            onerror: "x",
          },
        },
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
        { type: "image", attrs: { src: "/media/../secret" } },
      ],
    });
    assert.deepEqual(doc.content, [
      {
        type: "image",
        attrs: {
          src: "/media/sites/x/y/a.png",
          alt: "A",
          title: null,
          width: 640,
          height: null,
          mediaId: "abc-1",
        },
      },
    ]);
  });

  test("rendering uses current alt text and drops deleted files; usage is tracked", async () => {
    const asset = await uploadMedia(db, storage, "owner", siteId, {
      name: "seal.jpg",
      bytes: jpeg(1200, 800),
    });
    await updateMediaDetails(db, "owner", siteId, asset.id, { altText: "Old alt", caption: "" });
    const body = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "image", attrs: { src: asset.url, alt: "Old alt", mediaId: asset.id } },
      ],
    };
    const { id } = await createEntry(db, "owner", siteId, "post", "With image");
    let doc = await getEntryDocument(db, "owner", siteId, id);
    await saveEntry(db, "owner", siteId, id, {
      title: "With image",
      body,
      seo: {},
      expectedUpdatedAt: doc!.entry.updatedAt,
    });
    doc = await getEntryDocument(db, "owner", siteId, id);
    await transitionEntry(db, "owner", siteId, id, {
      action: "publish",
      expectedUpdatedAt: doc!.entry.updatedAt,
    });

    const usage = (await getMediaAsset(db, "owner", siteId, asset.id))?.usage;
    assert.deepEqual(
      usage?.map((u) => u.title),
      ["With image"],
    );

    await updateMediaDetails(db, "owner", siteId, asset.id, {
      altText: "A grey seal resting",
      caption: "",
    });
    const site = await getDeliverySite(db, siteId);
    const entry = await getPublishedEntry(db, site!, "post", "with-image");
    assert.match(entry!.body.html, /<img [^>]*alt="A grey seal resting"/);
    assert.match(entry!.body.html, new RegExp(`src="https://cms\\.example${asset.url}"`));
    assert.match(entry!.body.html, /width="1200" height="800"/);

    await deleteMedia(db, storage, "owner", siteId, [asset.id]);
    const after = await resolveMediaInDoc(db, siteId, sanitizeDoc(body));
    assert.deepEqual(
      after.content?.map((n) => n.type),
      ["paragraph"],
    );
  });
});
