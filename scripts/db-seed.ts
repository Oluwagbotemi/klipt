/**
 * Seeds local development data: two demo users and a few sites.
 *
 * Refuses to run against DATABASE_URL unless --force is passed, so it can't
 * accidentally write demo accounts into production. Stop the dev server
 * first when using local PGlite (single-process).
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  auditEvents,
  contentEntries,
  contentModels,
  sessions,
  siteMembers,
  siteOwnershipTransfers,
  users,
} from "@/server/db/schema";
import { slugify, type ContentStatus } from "@/lib/content";
import { createSite } from "@/server/sites";
import { createTerm, setEntryTerms } from "@/server/taxonomy";

const DEMO_PASSWORD = "klipt-demo-1234";

const DEMO_USERS = [
  { name: "Sam Rivera", email: "sam@klipt.test" },
  { name: "Morgan Lee", email: "morgan@klipt.test" },
  { name: "Riley Chen", email: "riley@klipt.test" },
];

const DAY = 24 * 60 * 60 * 1000;

type SeedDb = Awaited<ReturnType<typeof getDb>>;

/** Demo categories (nested) and tags, assigned to a few Northwind posts. */
async function seedTaxonomy(db: SeedDb, siteId: string, ownerId: string) {
  const add = async (taxonomy: string, name: string, parentId = "") =>
    (
      await createTerm(db, ownerId, siteId, taxonomy, {
        name,
        slug: slugify(name),
        parentId,
        description: "",
        seoTitle: "",
        seoDescription: "",
      })
    ).id;
  const outdoors = await add("category", "Outdoors");
  const walks = await add("category", "Coastal walks", outdoors);
  const wildlife = await add("category", "Wildlife", outdoors);
  const food = await add("category", "Food");
  await add("category", "Local history");
  const tags = {
    photography: await add("tag", "Photography"),
    recipes: await add("tag", "Recipes"),
    weekend: await add("tag", "Weekend ideas"),
  };

  const assign: [string, string[], string[]][] = [
    ["ten-coastal-walks-worth-the-drive", [walks], [tags.weekend]],
    ["why-the-harbour-seals-came-back", [wildlife], [tags.photography]],
    ["birdwatching-from-the-sea-wall", [wildlife], [tags.photography, tags.weekend]],
    ["five-recipes-for-fresh-mackerel", [food], [tags.recipes]],
    ["the-best-bakeries-along-the-ferry-route", [food], [tags.weekend]],
  ];
  for (const [slug, categories, tagIds] of assign) {
    const [entry] = await db
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.slug, slug)))
      .limit(1);
    if (!entry) continue;
    await setEntryTerms(db, ownerId, siteId, entry.id, "category", categories);
    await setEntryTerms(db, ownerId, siteId, entry.id, "tag", tagIds);
  }
}

/** Placeholder body so the editor has something to show. Clearly sample text. */
function sampleBody(title: string) {
  const text = (value: string) => ({ type: "text", text: value });
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(`Sample content for “${title}”. `),
          {
            type: "text",
            text: "This text was added by the demo seed",
            marks: [{ type: "bold" }],
          },
          text(" so the editor has something to show; replace it with your own writing."),
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [text("What this section covers")] },
      {
        type: "paragraph",
        content: [
          text(
            "Use headings to structure longer pieces, keep paragraphs short, and link to related pages where it helps readers, for example the ",
          ),
          {
            type: "text",
            text: "about page",
            marks: [{ type: "link", attrs: { href: "/about-us" } }],
          },
          text("."),
        ],
      },
      {
        type: "bulletList",
        content: [
          "A clear, specific title",
          "A short summary near the top",
          "Descriptive link text",
        ].map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [text(item)] }],
        })),
      },
    ],
  };
}

type SeedEntry = [model: "page" | "post", title: string, status: ContentStatus, author: string];

/** Inserts demo entries with staggered dates, newest first. */
async function seedEntries(
  db: Awaited<ReturnType<typeof getDb>>,
  siteId: string,
  entries: SeedEntry[],
) {
  const models = await db
    .select({ id: contentModels.id, key: contentModels.key })
    .from(contentModels)
    .where(eq(contentModels.siteId, siteId));
  const modelId = Object.fromEntries(models.map((m) => [m.key, m.id]));
  const now = Date.now();
  await db.insert(contentEntries).values(
    entries.map(([model, title, status, authorId], i) => {
      const updatedAt = new Date(now - i * 0.7 * DAY - 3600_000);
      const wasPublished = status === "published" || (status === "archived" && i % 2 === 0);
      return {
        siteId,
        modelId: modelId[model],
        title,
        slug: slugify(title),
        status,
        data: { body: sampleBody(title) },
        seo:
          status === "published" && i % 3 === 0
            ? { description: `A short summary of “${title}” for search results.` }
            : {},
        authorId,
        createdAt: new Date(updatedAt.getTime() - 5 * DAY),
        updatedAt,
        publishedAt: wasPublished ? new Date(updatedAt.getTime() - DAY) : null,
        scheduledAt: status === "scheduled" ? new Date(now + (i + 2) * DAY) : null,
      };
    }),
  );
}

/** Demo assignments, a review request and a week of activity on Northwind. */
async function seedTeamWork(
  db: SeedDb,
  siteId: string,
  people: { sam: string; morgan: string; riley: string },
) {
  const rows = await db
    .select({ id: contentEntries.id, title: contentEntries.title })
    .from(contentEntries)
    .where(eq(contentEntries.siteId, siteId));
  const byTitle = new Map(rows.map((row) => [row.title, row.id]));
  const entry = (title: string) => {
    const id = byTitle.get(title);
    if (!id) throw new Error(`Seed entry missing: ${title}`);
    return { id, title };
  };
  const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

  const spring = entry("Spring planting guide for small gardens");
  const tides = entry("What the tide tables don't tell you");
  const lights = entry("How we photograph the northern lights");
  const festival = entry("Notes from a rainy festival weekend");
  const winter = entry("Winter reading list");
  const assign = (id: string, assigneeId: string, dueOn: string | null) =>
    db
      .update(contentEntries)
      .set({ assigneeId, dueOn, updatedAt: sql`${contentEntries.updatedAt}` })
      .where(eq(contentEntries.id, id));
  await assign(spring.id, people.riley, day(3));
  await assign(tides.id, people.sam, day(-1));
  await assign(lights.id, people.riley, null);
  await assign(festival.id, people.morgan, day(2));

  const at = (daysAgo: number, hour = 0) => new Date(Date.now() - daysAgo * DAY - hour * 3600_000);
  const content = (targetId: string) => ({ targetType: "content_entry", targetId });
  await db.insert(auditEvents).values(
    [
      {
        action: "member.joined",
        actorId: people.riley,
        targetType: "member",
        targetId: people.riley,
        metadata: { role: "author" },
        createdAt: at(6, 3),
      },
      {
        action: "member.joined",
        actorId: people.morgan,
        targetType: "member",
        targetId: people.morgan,
        metadata: { role: "editor" },
        createdAt: at(6, 1),
      },
      {
        action: "seo.defaults_changed",
        actorId: people.sam,
        targetType: "site",
        targetId: siteId,
        metadata: {},
        createdAt: at(5, 2),
      },
      {
        action: "content.published",
        actorId: people.sam,
        ...content(winter.id),
        metadata: { title: winter.title, from: "draft", to: "published" },
        createdAt: at(4, 5),
      },
      {
        action: "content.created",
        actorId: people.riley,
        ...content(spring.id),
        metadata: { title: spring.title, model: "post" },
        createdAt: at(3, 6),
      },
      {
        action: "content.assigned",
        actorId: people.sam,
        ...content(spring.id),
        metadata: { title: spring.title, assigneeId: people.riley, assigneeName: "Riley Chen" },
        createdAt: at(3, 2),
      },
      {
        action: "content.due_changed",
        actorId: people.sam,
        ...content(spring.id),
        metadata: { title: spring.title, dueOn: day(3) },
        createdAt: at(3, 2),
      },
      {
        action: "content.submitted_for_review",
        actorId: people.riley,
        ...content(lights.id),
        metadata: { title: lights.title, from: "draft", to: "in_review" },
        createdAt: at(2, 4),
      },
      {
        action: "content.assigned",
        actorId: people.sam,
        ...content(festival.id),
        metadata: { title: festival.title, assigneeId: people.morgan, assigneeName: "Morgan Lee" },
        createdAt: at(1, 8),
      },
      {
        action: "content.updated",
        actorId: people.riley,
        ...content(spring.id),
        metadata: { title: spring.title },
        createdAt: at(1, 3),
      },
      {
        action: "content.assigned",
        actorId: people.sam,
        ...content(tides.id),
        metadata: { title: tides.title, assigneeId: people.sam, assigneeName: "Sam Rivera" },
        createdAt: at(0, 5),
      },
    ].map((event) => ({ siteId, ...event })),
  );
}

async function main() {
  if (process.env.DATABASE_URL && !process.argv.includes("--force")) {
    console.error("DATABASE_URL is set. Refusing to seed demo data without --force.");
    process.exit(1);
  }

  const db = await getDb();
  const auth = createAuth(db);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_USERS[0].email));
  if (existing) {
    console.log("Demo data already present; nothing to do.");
    return;
  }

  const ids: string[] = [];
  for (const user of DEMO_USERS) {
    const result = await auth.api.signUpEmail({ body: { ...user, password: DEMO_PASSWORD } });
    ids.push(result.user.id);
  }
  // Sign-up signs the user in; drop those sessions so Security › Signed-in devices starts empty.
  await db.delete(sessions).where(inArray(sessions.userId, ids));
  const [samId, morganId, rileyId] = ids;

  const northwind = await createSite(db, samId, {
    name: "Northwind Journal",
    domain: "northwindjournal.example",
  });
  await db.insert(siteMembers).values([
    { siteId: northwind.id, userId: rileyId, role: "author" },
    { siteId: northwind.id, userId: morganId, role: "editor" },
  ]);
  const harbor = await createSite(db, samId, {
    name: "Harbor & Pine Studio",
    domain: "harborpine.example",
  });
  await createSite(db, samId, { name: "Lumen Clinic", domain: null });
  const atlas = await createSite(db, morganId, {
    name: "Atlas Outdoor Supply",
    domain: "atlasoutdoor.example",
  });
  await db.insert(siteMembers).values({ siteId: atlas.id, userId: samId, role: "editor" });

  await seedEntries(db, northwind.id, [
    ["post", "Spring planting guide for small gardens", "draft", rileyId],
    ["post", "How we photograph the northern lights", "in_review", rileyId],
    ["page", "Home", "published", samId],
    ["post", "Ten coastal walks worth the drive", "scheduled", samId],
    ["page", "About us", "published", samId],
    ["post", "Interview: the last lighthouse keeper", "published", samId],
    ["post", "A beginner's guide to foraging", "published", rileyId],
    ["page", "Contact", "published", samId],
    ["post", "What the tide tables don't tell you", "draft", samId],
    ["post", "Winter reading list", "published", samId],
    ["page", "Advertise with us", "draft", samId],
    ["post", "The best bakeries along the ferry route", "published", rileyId],
    ["post", "Notes from a rainy festival weekend", "in_review", samId],
    ["post", "Why the harbour seals came back", "published", samId],
    ["page", "Newsletter", "published", samId],
    ["post", "Packing list for a wild-camping trip", "published", rileyId],
    ["post", "Old maps of the coastline", "archived", samId],
    ["post", "Our 2025 year in review", "published", samId],
    ["page", "Privacy policy", "published", samId],
    ["post", "Storm-watching safely", "published", samId],
    ["post", "A day with the island ferry crew", "published", rileyId],
    ["post", "Draft ideas: autumn issue", "archived", rileyId],
    ["page", "Old summer events page", "archived", samId],
    ["post", "Five recipes for fresh mackerel", "published", samId],
    ["post", "Birdwatching from the sea wall", "published", samId],
  ]);
  await seedEntries(db, atlas.id, [
    ["page", "Home", "published", morganId],
    ["post", "Choosing a three-season tent", "published", morganId],
    ["post", "How to waterproof your boots", "draft", samId],
    ["page", "Shipping and returns", "published", morganId],
    ["post", "Trail running shoes compared", "in_review", samId],
    ["page", "Store locations", "archived", morganId],
  ]);
  await seedTaxonomy(db, northwind.id, samId);
  await seedTeamWork(db, northwind.id, { sam: samId, morgan: morganId, riley: rileyId });
  await seedEntries(db, harbor.id, [
    ["page", "Home", "published", samId],
    ["page", "Our work", "draft", samId],
    ["post", "Studio news: new workshop space", "draft", samId],
  ]);

  // A pending (not accepted) transfer, to exercise the "Transfer pending" state.
  await db.insert(siteOwnershipTransfers).values({
    siteId: harbor.id,
    fromUserId: samId,
    recipientEmail: "client@harborpine.example",
    // A random, unshared token: the owner can make a new link from Settings › Ownership.
    tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  console.log("Seeded demo data. Sign in with:");
  for (const user of DEMO_USERS) console.log(`  ${user.email} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
