/**
 * Seeds local development data: two demo users and a few sites.
 *
 * Refuses to run against DATABASE_URL unless --force is passed, so it can't
 * accidentally write demo accounts into production. Stop the dev server
 * first when using local PGlite (single-process).
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { siteMembers, siteOwnershipTransfers, users } from "@/server/db/schema";
import { createSite } from "@/server/sites";

const DEMO_PASSWORD = "klipt-demo-1234";

const DEMO_USERS = [
  { name: "Sam Rivera", email: "sam@klipt.test" },
  { name: "Morgan Lee", email: "morgan@klipt.test" },
];

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
  const [samId, morganId] = ids;

  await createSite(db, samId, { name: "Northwind Journal", domain: "northwindjournal.example" });
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

  // A pending (not accepted) transfer, to exercise the "Transfer pending" state.
  await db.insert(siteOwnershipTransfers).values({
    siteId: harbor.id,
    fromUserId: samId,
    recipientEmail: "client@harborpine.example",
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
