import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { createEntry } from "@/server/content";
import { createPgliteDatabase, type Database } from "@/server/db";
import { contentEntries, sessions, siteInvitations, siteMembers, users } from "@/server/db/schema";
import { sendInBackground, settleEmails } from "@/server/email/background";
import {
  approvedEmail,
  changesRequestedEmail,
  escapeHtml,
  invitationEmail,
} from "@/server/email/templates";
import { sendWithResend, setEmailTransport, type EmailMessage } from "@/server/email/transport";
import {
  entryMessages,
  invitationMessage,
  MAX_REVIEW_RECIPIENTS,
  setAssignmentEmails,
  transferAnsweredMessage,
} from "@/server/notifications";
import { createSite } from "@/server/sites";
import { createInvitation, resendInvitation, TeamError } from "@/server/team";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-email-0123456789abcdef";
process.env.BETTER_AUTH_URL = "https://cms.example";

const ORIGIN = "https://cms.example";
let db: Database;
let siteId: string;
let sent: EmailMessage[] = [];

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "author2", "viewer"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Journal <&> News", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "author2", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
  setEmailTransport(async (message) => {
    sent.push(message);
  });
});

after(() => setEmailTransport(null));

beforeEach(() => {
  sent = [];
});

async function entryBy(authorId: string, assigneeId: string | null = null, title = "Winter list") {
  const { id } = await createEntry(db, authorId, siteId, "post");
  await db.update(contentEntries).set({ title, assigneeId }).where(eq(contentEntries.id, id));
  return id;
}

const recipients = (messages: EmailMessage[]) => messages.map((m) => m.to).sort();

describe("templates", () => {
  test("escape everything people typed, and include a plain-text part", () => {
    const email = invitationEmail({
      inviterName: `Eve <img src=x onerror=alert(1)>`,
      siteName: `"Quotes" & <b>bold</b>`,
      roleLabel: "Editor",
      url: "https://cms.example/invite/abc?x=1&y=2",
      days: 7,
    });
    assert.ok(!email.html.includes("<img src=x"));
    assert.ok(!email.html.includes("<b>bold</b>"));
    assert.ok(email.html.includes("&lt;b&gt;bold&lt;/b&gt;"));
    assert.ok(email.html.includes('href="https://cms.example/invite/abc?x=1&amp;y=2"'));
    assert.ok(email.text.includes("https://cms.example/invite/abc?x=1&y=2"));
    assert.ok(email.text.includes("Accept invitation"));
    assert.equal(escapeHtml(`<'"&>`), "&lt;&#39;&quot;&amp;&gt;");
  });

  test("reviewer notes are quoted and escaped", () => {
    const email = changesRequestedEmail({
      actorName: "Sam",
      title: "Post",
      siteName: "Blog",
      url: `${ORIGIN}/x`,
      accountUrl: `${ORIGIN}/account`,
      note: "Fix the <intro>\nand the ending",
    });
    assert.ok(email.html.includes("Fix the &lt;intro&gt;"));
    assert.ok(email.text.includes("Fix the <intro>\nand the ending"));
    assert.ok(email.text.includes(`${ORIGIN}/account`), "says how to turn these off");
  });

  test("approval says whether it's live or scheduled", () => {
    const base = { actorName: "Sam", title: "Post", siteName: "Blog", url: "u", accountUrl: "a" };
    assert.match(approvedEmail({ ...base, scheduledAt: null }).subject, /published/);
    assert.match(
      approvedEmail({ ...base, scheduledAt: new Date("2030-01-02T03:04:00Z") }).text,
      /scheduled to go live on .*2030/,
    );
  });
});

describe("Resend transport", () => {
  test("posts the message with the API key and sender", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Klipt <hello@cms.example>";
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "1" }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await sendWithResend(
        { to: "a@test.local", subject: "Hi", html: "<p>Hi</p>", text: "Hi", kind: "invitation" },
        fakeFetch,
      );
    } finally {
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(
      (calls[0].init.headers as Record<string, string>).Authorization,
      "Bearer re_test_key",
    );
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.to, ["a@test.local"]);
    assert.equal(body.from, "Klipt <hello@cms.example>");
    assert.equal(body.text, "Hi");
    assert.equal(body.html, "<p>Hi</p>");
  });

  test("a refusal throws without revealing the key", async () => {
    process.env.RESEND_API_KEY = "re_secret_value";
    const refuse = (async () =>
      new Response('{"message":"Domain not verified"}', {
        status: 403,
      })) as unknown as typeof fetch;
    try {
      await assert.rejects(
        sendWithResend(
          { to: "a@test.local", subject: "s", html: "h", text: "t", kind: "k" },
          refuse,
        ),
        (error: Error) => /403/.test(error.message) && !error.message.includes("re_secret_value"),
      );
    } finally {
      delete process.env.RESEND_API_KEY;
    }
  });
});

describe("sending in the background", () => {
  test("a failing send is logged, never thrown, and later messages still go", async () => {
    const delivered: string[] = [];
    setEmailTransport(async (message) => {
      if (message.to === "broken@test.local") throw new Error("provider down");
      delivered.push(message.to);
    });
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const message = { subject: "s", html: "h", text: "t", kind: "k" };
      assert.doesNotThrow(() =>
        sendInBackground([
          { to: "broken@test.local", ...message },
          { to: "fine@test.local", ...message },
        ]),
      );
      sendInBackground(async () => {
        throw new Error("couldn't build");
      });
      await settleEmails();
    } finally {
      console.error = original;
      setEmailTransport(async (message) => {
        sent.push(message);
      });
    }
    assert.deepEqual(delivered, ["fine@test.local"]);
    assert.equal(errors.length, 2);
  });
});

describe("invitations", () => {
  test("go to the invited address with the link, inviter and site", async () => {
    const { id, token } = await createInvitation(db, "owner", siteId, {
      email: "New@Test.local",
      role: "editor",
    });
    const url = `${ORIGIN}/invite/${token}`;
    const message = await invitationMessage(db, id, url);
    assert.ok(message);
    assert.equal(message.to, "new@test.local");
    assert.match(message.subject, /User owner invited you to Journal <&> News/);
    assert.ok(message.html.includes(url));
    assert.ok(message.html.includes("Journal &lt;&amp;&gt; News"));
  });

  test("can be emailed again at most once a minute", async () => {
    const { id, token } = await createInvitation(db, "owner", siteId, {
      email: "again@test.local",
      role: "author",
    });
    await assert.rejects(resendInvitation(db, "owner", siteId, id), TeamError);
    await db
      .update(siteInvitations)
      .set({ emailedAt: new Date(Date.now() - 61_000) })
      .where(eq(siteInvitations.id, id));
    assert.equal(await resendInvitation(db, "owner", siteId, id), token);
    await assert.rejects(resendInvitation(db, "owner", siteId, id), /Wait a minute/);
    // Authors can't manage invitations at all.
    await assert.rejects(resendInvitation(db, "author", siteId, id));
  });
});

describe("assignment and review emails", () => {
  const notify = (
    entryId: string,
    actorId: string,
    event: Parameters<typeof entryMessages>[1]["event"],
  ) => entryMessages(db, { siteId, entryId, actorId, origin: ORIGIN, event });

  test("assigning emails the assignee, with a link to the entry", async () => {
    const id = await entryBy("author", "author2");
    const messages = await notify(id, "editor", { kind: "assigned", dueOn: "2030-03-04" });
    assert.deepEqual(recipients(messages), ["author2@test.local"]);
    assert.ok(messages[0].html.includes(`${ORIGIN}/sites/${siteId}/content/${id}`));
    assert.match(messages[0].text, /due on 4 March 2030/);
  });

  test("assigning yourself sends nothing", async () => {
    const id = await entryBy("author", "author");
    assert.deepEqual(await notify(id, "author", { kind: "assigned", dueOn: null }), []);
  });

  test("a review request goes to the people who can publish, not the requester", async () => {
    const id = await entryBy("author");
    const messages = await notify(id, "author", { kind: "review_requested" });
    assert.deepEqual(recipients(messages), [
      "admin@test.local",
      "editor@test.local",
      "owner@test.local",
    ]);
  });

  test("an editor requesting review emails the other publishers only", async () => {
    const id = await entryBy("editor");
    assert.deepEqual(recipients(await notify(id, "editor", { kind: "review_requested" })), [
      "admin@test.local",
      "owner@test.local",
    ]);
  });

  test("an assignee who can publish is the one reviewer emailed", async () => {
    const id = await entryBy("author", "editor");
    assert.deepEqual(recipients(await notify(id, "author", { kind: "review_requested" })), [
      "editor@test.local",
    ]);
  });

  test("large teams: at most a handful of reviewers, owner and admins first", async () => {
    const big = (await createSite(db, "owner", { name: "Big", domain: null })).id;
    for (let i = 0; i < MAX_REVIEW_RECIPIENTS + 5; i++) {
      await db.insert(users).values({ id: `ed${i}`, name: `Ed ${i}`, email: `ed${i}@test.local` });
      await db.insert(siteMembers).values({ siteId: big, userId: `ed${i}`, role: "editor" });
    }
    await db.insert(siteMembers).values({ siteId: big, userId: "author", role: "author" });
    const { id } = await createEntry(db, "author", big, "post");
    const messages = await entryMessages(db, {
      siteId: big,
      entryId: id,
      actorId: "author",
      origin: ORIGIN,
      event: { kind: "review_requested" },
    });
    assert.equal(messages.length, MAX_REVIEW_RECIPIENTS);
    assert.ok(messages.some((m) => m.to === "owner@test.local"));
  });

  test("changes requested and approval go to the writer and the assignee, not the reviewer", async () => {
    const id = await entryBy("author", "author2");
    const changes = await notify(id, "editor", { kind: "changes_requested", note: "Tighten it" });
    assert.deepEqual(recipients(changes), ["author2@test.local", "author@test.local"]);
    assert.ok(changes[0].text.includes("Tighten it"));
    const approved = await notify(id, "author2", { kind: "approved", scheduledAt: null });
    assert.deepEqual(recipients(approved), ["author@test.local"]);
  });

  test("people who turned these emails off don't get them", async () => {
    const id = await entryBy("author", "author2");
    await setAssignmentEmails(db, "author2", false);
    try {
      assert.deepEqual(
        recipients(await notify(id, "editor", { kind: "changes_requested", note: "" })),
        ["author@test.local"],
      );
      assert.deepEqual(await notify(id, "editor", { kind: "assigned", dueOn: null }), []);
    } finally {
      await setAssignmentEmails(db, "author2", true);
    }
  });

  test("people who left the site aren't emailed", async () => {
    await db.insert(users).values({ id: "leaver", name: "Leaver", email: "leaver@test.local" });
    await db.insert(siteMembers).values({ siteId, userId: "leaver", role: "author" });
    const id = await entryBy("leaver");
    await db.delete(siteMembers).where(eq(siteMembers.userId, "leaver"));
    assert.deepEqual(await notify(id, "editor", { kind: "approved", scheduledAt: null }), []);
  });
});

describe("ownership transfer emails", () => {
  test("the previous owner hears that it was accepted or declined", async () => {
    const recipient = { id: "editor", name: "User editor", email: "editor@test.local" };
    const accepted = await transferAnsweredMessage(db, {
      siteId,
      fromUserId: "owner",
      recipient,
      accepted: true,
      retainedAdmin: true,
      origin: ORIGIN,
    });
    assert.equal(accepted?.to, "owner@test.local");
    assert.match(accepted!.subject, /User editor is now the owner/);
    const declined = await transferAnsweredMessage(db, {
      siteId,
      fromUserId: "owner",
      recipient,
      accepted: false,
      retainedAdmin: false,
      origin: ORIGIN,
    });
    assert.match(declined!.subject, /declined/);
    assert.ok(declined!.html.includes(`/sites/${siteId}/settings/ownership`));
    // A deleted previous owner: nobody to tell.
    assert.equal(
      await transferAnsweredMessage(db, {
        siteId,
        fromUserId: null,
        recipient,
        accepted: true,
        retainedAdmin: false,
        origin: ORIGIN,
      }),
      null,
    );
  });
});

describe("password reset and email confirmation (Better Auth)", () => {
  test("unknown and known emails get the same answer; only real accounts get a link", async () => {
    const auth = createAuth(db);
    await auth.api.signUpEmail({
      body: { name: "Reset Me", email: "reset@test.local", password: "first-password-1" },
    });
    await settleEmails();
    const verification = sent.find((m) => m.kind === "verify_email");
    assert.equal(verification?.to, "reset@test.local", "sign-up sends a confirmation link");
    assert.match(
      verification!.text,
      /\/api\/auth\/verify-email\?token=.*callbackURL=%2Femail-verified/,
    );
    sent = [];

    const unknown = await auth.api.requestPasswordReset({
      body: { email: "nobody@test.local", redirectTo: "/reset-password" },
    });
    const known = await auth.api.requestPasswordReset({
      body: { email: "reset@test.local", redirectTo: "/reset-password" },
    });
    assert.deepEqual(unknown, known);
    await settleEmails();
    assert.deepEqual(recipients(sent), ["reset@test.local"]);
    const link = /https:\/\/cms\.example\/reset-password\?token=([\w-]+)/.exec(sent[0].text);
    assert.ok(link, "the email links to Klipt's reset page");

    const [user] = await db.select().from(users).where(eq(users.email, "reset@test.local"));
    assert.ok((await db.select().from(sessions).where(eq(sessions.userId, user.id))).length > 0);
    await auth.api.resetPassword({ body: { newPassword: "second-password-2", token: link[1] } });
    assert.equal(
      (await db.select().from(sessions).where(eq(sessions.userId, user.id))).length,
      0,
      "a reset signs every device out",
    );
    await assert.rejects(
      auth.api.resetPassword({ body: { newPassword: "third-password-3", token: link[1] } }),
      "a reset link works once",
    );
    const signedIn = await auth.api.signInEmail({
      body: { email: "reset@test.local", password: "second-password-2" },
    });
    assert.ok(signedIn.token);
    await assert.rejects(
      auth.api.signInEmail({ body: { email: "reset@test.local", password: "first-password-1" } }),
    );
  });
});
