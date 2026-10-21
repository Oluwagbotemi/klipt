import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, contentEntries, siteMembers, users } from "@/server/db/schema";
import {
  AssignmentError,
  getAssignmentBoard,
  listAssignees,
  setAssignment,
} from "@/server/assignments";
import { createEntry, listEntries } from "@/server/content";
import { getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createSite } from "@/server/sites";
import { changeMemberRole, removeMember } from "@/server/team";
import { assignmentRights, dueOnSchema, isOverdue } from "@/lib/assignments";
import { canEditEntry, parseContentListParams, workflowActions } from "@/lib/content";

let db: Database;
let siteId: string;

async function entry(userId: string, title = "Draft") {
  const created = await createEntry(db, userId, siteId, "post");
  await db.update(contentEntries).set({ title }).where(eq(contentEntries.id, created.id));
  return created.id;
}

async function doc(entryId: string, userId = "owner") {
  const found = await getEntryDocument(db, userId, siteId, entryId);
  assert.ok(found);
  return found;
}

async function actions(entryId: string) {
  const rows = await db
    .select({ action: auditEvents.action, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(and(eq(auditEvents.siteId, siteId), eq(auditEvents.targetId, entryId)))
    .orderBy(auditEvents.createdAt);
  return rows;
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "editor", "author", "author2", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Journal", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "author2", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("assignment rules (client-safe)", () => {
  test("editors assign anyone; authors take on their own work only", () => {
    const draft = {
      status: "draft" as const,
      authorId: "author",
      assigneeId: null,
      publishedAt: null,
    };
    assert.deepEqual(assignmentRights("editor", "editor", draft), {
      assignAnyone: true,
      setDue: true,
      takeOn: true,
      letGo: false,
    });
    assert.equal(assignmentRights("author", "author", draft).takeOn, true);
    assert.equal(assignmentRights("author", "author2", draft).takeOn, false);
    assert.equal(assignmentRights("author", "author2", draft).assignAnyone, false);
    assert.equal(
      assignmentRights("author", "author2", { ...draft, assigneeId: "author2" }).letGo,
      true,
    );
    assert.equal(assignmentRights("viewer", "viewer", draft).takeOn, false);
  });

  test("an assigned author can edit and send for review, but not someone else's live content", () => {
    const draft = {
      status: "draft" as const,
      authorId: "author",
      assigneeId: "author2",
      publishedAt: null,
    };
    assert.equal(canEditEntry("author", "author2", draft), true);
    assert.equal(workflowActions("author", "author2", draft).submit, true);
    assert.equal(canEditEntry("author", "author2", { ...draft, status: "published" }), false);
    assert.equal(canEditEntry("author", "author2", { ...draft, assigneeId: null }), false);
  });

  test("reviewers can request changes on entries in review", () => {
    const review = { status: "in_review" as const, authorId: "author", publishedAt: null };
    assert.equal(workflowActions("editor", "editor", review).request_changes, true);
    assert.equal(
      workflowActions("editor", "editor", { ...review, status: "draft" }).request_changes,
      false,
    );
    assert.equal(workflowActions("author", "author", review).request_changes, false);
  });

  test("due dates and the assignee filter", () => {
    assert.equal(dueOnSchema.safeParse("2026-02-30").success, false);
    assert.equal(dueOnSchema.safeParse("soon").success, false);
    assert.equal(dueOnSchema.safeParse(null).success, true);
    assert.equal(isOverdue({ dueOn: "2026-01-01", status: "draft" }, "2026-01-02"), true);
    assert.equal(isOverdue({ dueOn: "2026-01-02", status: "draft" }, "2026-01-02"), false);
    assert.equal(isOverdue({ dueOn: "2026-01-01", status: "published" }, "2026-01-02"), false);
    assert.equal(parseContentListParams({ assignee: "me" }).assignee, "me");
    assert.equal(parseContentListParams({ assignee: "bad value!" }).assignee, "");
  });
});

describe("setAssignment", () => {
  test("assigning keeps the entry's version and is logged", async () => {
    const id = await entry("owner", "Spring guide");
    const before = (await doc(id)).entry.updatedAt;
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const state = await setAssignment(db, "editor", siteId, id, {
      assigneeId: "author",
      dueOn: due,
    });
    assert.deepEqual(state, {
      assigneeId: "author",
      assigneeName: "User author",
      dueOn: due,
      assigneeChanged: true,
    });
    const after = await doc(id);
    assert.equal(after.entry.updatedAt, before, "updatedAt unchanged");
    assert.equal(after.entry.assigneeName, "User author");
    // The editor's autosave with the old version still works.
    await saveEntry(db, "owner", siteId, id, {
      title: "Spring guide",
      body: after.body,
      seo: {},
      expectedUpdatedAt: before,
    });
    const logged = (await actions(id)).map((row) => row.action);
    assert.ok(logged.includes("content.assigned"));
    assert.ok(logged.includes("content.due_changed"));
  });

  test("the assigned author can now edit someone else's draft", async () => {
    const id = await entry("owner", "Handed over");
    await setAssignment(db, "editor", siteId, id, { assigneeId: "author", dueOn: null });
    const current = await doc(id, "author");
    await saveEntry(db, "author", siteId, id, {
      title: "Handed over, edited",
      body: current.body,
      seo: {},
      expectedUpdatedAt: current.entry.updatedAt,
    });
    assert.equal((await doc(id)).entry.title, "Handed over, edited");
  });

  test("authors may take on their own drafts and let go, nothing more", async () => {
    const own = await entry("author", "Mine");
    await setAssignment(db, "author", siteId, own, { assigneeId: "author", dueOn: null });
    await setAssignment(db, "author", siteId, own, { assigneeId: null, dueOn: null });

    const other = await entry("owner", "Not mine");
    await assert.rejects(
      setAssignment(db, "author", siteId, other, { assigneeId: "author", dueOn: null }),
      NotAllowedError,
    );
    await assert.rejects(
      setAssignment(db, "author", siteId, own, { assigneeId: "author2", dueOn: null }),
      NotAllowedError,
    );
    await assert.rejects(
      setAssignment(db, "author", siteId, own, { assigneeId: null, dueOn: "2030-01-01" }),
      NotAllowedError,
    );
    await assert.rejects(
      setAssignment(db, "viewer", siteId, own, { assigneeId: "viewer", dueOn: null }),
      NotAllowedError,
    );
    await assert.rejects(
      setAssignment(db, "stranger", siteId, own, { assigneeId: null, dueOn: null }),
      NotAllowedError,
    );
  });

  test("only members who work on content can be assigned", async () => {
    const id = await entry("owner");
    await assert.rejects(
      setAssignment(db, "owner", siteId, id, { assigneeId: "viewer", dueOn: null }),
      AssignmentError,
    );
    await assert.rejects(
      setAssignment(db, "owner", siteId, id, { assigneeId: "stranger", dueOn: null }),
      AssignmentError,
    );
    await assert.rejects(
      setAssignment(db, "owner", siteId, id, { assigneeId: null, dueOn: "2026-13-01" }),
      AssignmentError,
    );
    assert.deepEqual(
      (await listAssignees(db, "author", siteId)).assignees.map((person) => person.id).sort(),
      ["author", "author2", "editor", "owner"],
    );
  });

  test("authors aren't assigned live content; editors are", async () => {
    const id = await entry("owner", "Live");
    const current = await doc(id);
    await transitionEntry(db, "owner", siteId, id, {
      action: "publish",
      expectedUpdatedAt: current.entry.updatedAt,
    });
    await assert.rejects(
      setAssignment(db, "owner", siteId, id, { assigneeId: "author", dueOn: null }),
      AssignmentError,
    );
    await setAssignment(db, "owner", siteId, id, { assigneeId: "editor", dueOn: null });
  });

  test("removing a member or taking away content rights clears their assignments", async () => {
    const a = await entry("owner", "For author2");
    await setAssignment(db, "owner", siteId, a, { assigneeId: "author2", dueOn: null });
    const b = await entry("owner", "For editor");
    await setAssignment(db, "owner", siteId, b, { assigneeId: "editor", dueOn: null });

    await removeMember(db, "owner", siteId, "author2");
    assert.equal((await doc(a)).entry.assigneeId, null);
    const cleared = (await actions(a)).at(-1);
    assert.equal(cleared?.action, "content.unassigned");
    assert.equal(cleared?.metadata.previousName, "User author2");

    await changeMemberRole(db, "owner", siteId, "editor", "viewer");
    assert.equal((await doc(b)).entry.assigneeId, null);
    await changeMemberRole(db, "owner", siteId, "editor", "editor");
  });
});

describe("review workflow", () => {
  test("request changes sends it back with a note; resubmitting clears it", async () => {
    const id = await entry("author", "Needs work");
    let current = await doc(id, "author");
    let state = await transitionEntry(db, "author", siteId, id, {
      action: "submit",
      expectedUpdatedAt: current.entry.updatedAt,
    });
    assert.equal(state.status, "in_review");

    await assert.rejects(
      transitionEntry(db, "author", siteId, id, {
        action: "request_changes",
        expectedUpdatedAt: state.updatedAt,
      }),
      NotAllowedError,
    );
    state = await transitionEntry(db, "editor", siteId, id, {
      action: "request_changes",
      note: "Add a summary.",
      expectedUpdatedAt: state.updatedAt,
    });
    assert.equal(state.status, "draft");
    current = await doc(id, "author");
    assert.equal(current.reviewFeedback?.note, "Add a summary.");
    assert.equal(current.reviewFeedback?.byName, "User editor");

    state = await transitionEntry(db, "author", siteId, id, {
      action: "submit",
      expectedUpdatedAt: state.updatedAt,
    });
    assert.equal((await doc(id)).reviewFeedback, null);

    await transitionEntry(db, "editor", siteId, id, {
      action: "publish",
      expectedUpdatedAt: state.updatedAt,
    });
    const logged = await actions(id);
    const changes = logged.find((row) => row.action === "content.changes_requested");
    assert.equal(changes?.metadata.note, "Add a summary.");
    const published = logged.find((row) => row.action === "content.published");
    assert.equal(published?.metadata.from, "in_review");
  });
});

describe("assignment board and content list", () => {
  test("groups open work by person, reviews, overdue and unassigned", async () => {
    const overdue = await entry("owner", "Late piece");
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await setAssignment(db, "owner", siteId, overdue, { assigneeId: "author", dueOn: yesterday });
    const loose = await entry("owner", "Nobody's");

    const board = await getAssignmentBoard(db, "author", siteId);
    const authorItems = board.people.find((person) => person.id === "author")?.items ?? [];
    assert.ok(authorItems.some((item) => item.id === overdue));
    assert.ok(board.overdue.some((item) => item.id === overdue));
    assert.ok(board.unassigned.some((item) => item.id === loose));
    assert.ok(!board.unassigned.some((item) => item.id === overdue));
    await assert.rejects(getAssignmentBoard(db, "viewer", siteId), NotAllowedError);

    const mine = await listEntries(db, "author", siteId, "all", {
      ...parseContentListParams({}),
      assignee: "me",
    });
    assert.ok(mine.items.length > 0);
    assert.ok(mine.items.every((item) => item.assigneeId === "author"));
    const byId = await listEntries(db, "owner", siteId, "all", {
      ...parseContentListParams({}),
      assignee: "author",
    });
    assert.equal(byId.assigneeName, "User author");
    const none = await listEntries(db, "owner", siteId, "all", {
      ...parseContentListParams({}),
      assignee: "none",
    });
    assert.ok(none.items.every((item) => item.assigneeId === null));
  });
});
