import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment, editComment } from "./comments.server";
import { createFakeNotifier, type FakeNotifier } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date("2026-10-06T12:00:00.000Z");

let db: TestDb;
let notifier: FakeNotifier;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  notifier = createFakeNotifier();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  moduleId = module.id;

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("createComment", () => {
  it("creates a Discussion Question on a lesson", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "  How do closures work?  ",
      NOW
    );

    expect(question).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How do closures work?",
      createdAt: "2026-10-06T12:00:00.000Z",
      deletedAt: null,
    });
  });

  it("creates a Discussion Reply to a question on the same lesson", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const reply = await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "Because.",
      NOW
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "Because.",
    });
  });

  it("refuses a reply to a reply, keeping replies one level deep", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );
    const reply = await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "Because.",
      NOW
    );

    await expect(
      createComment(db, notifier, base.user.id, lessonId, reply.id, "But why?", NOW)
    ).rejects.toThrow("Replies can only be one level deep");
  });

  it("refuses a reply to a question on a different lesson", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );
    const otherLessonId = db
      .insert(schema.lessons)
      .values({ moduleId, title: "Lesson 2", position: 2 })
      .returning()
      .get().id;

    await expect(
      createComment(
        db,
        notifier,
        base.instructor.id,
        otherLessonId,
        question.id,
        "Because.",
        NOW
      )
    ).rejects.toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses an empty body", async () => {
    await expect(
      createComment(db, notifier, base.user.id, lessonId, null, "   ", NOW)
    ).rejects.toThrow("Comment cannot be empty");
  });
});

describe("Discussion Reply Notification", () => {
  it("tells the question's author someone else replied", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );

    const reply = await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "  A closure keeps   the scope it was created in.  ",
      NOW
    );

    expect(
      notifier.triggers.filter((t) => t.kind === "discussion-reply")
    ).toEqual([
      {
        kind: "discussion-reply",
        recipients: [
          {
            id: base.user.id,
            name: "Test User",
            email: "test@example.com",
            avatarUrl: null,
          },
        ],
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        data: {
          commentId: reply.id,
          questionId: question.id,
          courseSlug: "test-course",
          courseTitle: "Test Course",
          lessonId,
          lessonTitle: "Lesson 1",
          snippet: "A closure keeps the scope it was created in.",
        },
        idempotencyKey: `discussion-reply:${reply.id}`,
      },
    ]);
  });
  it("tells nobody when the author replies to their own question", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );

    await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      question.id,
      "Never mind, I worked it out.",
      NOW
    );

    expect(
      notifier.triggers.filter((t) => t.kind === "discussion-reply")
    ).toEqual([]);
  });

  it("tells only the question's author, not others in the thread", async () => {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    await createComment(
      db,
      notifier,
      other.id,
      lessonId,
      question.id,
      "Good question.",
      NOW
    );
    notifier.triggers.length = 0;

    await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "Here is how.",
      NOW
    );

    expect(notifier.triggers.map((t) => t.recipients.map((r) => r.id))).toEqual(
      [[base.user.id]]
    );
  });

  it("still saves the reply when sending the Notification fails", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    notifier.failWith(new Error("Knock is down"));

    const reply = await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "Because.",
      NOW
    );

    expect(reply).toMatchObject({ parentId: question.id, body: "Because." });
    expect(
      db
        .select()
        .from(schema.comments)
        .all()
        .map((c) => c.id)
    ).toContain(reply.id);
  });

  it("does not send a Discussion Reply Notification for a question", async () => {
    await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );

    expect(
      notifier.triggers.filter((t) => t.kind === "discussion-reply")
    ).toEqual([]);
  });
});

describe("deleteComment", () => {
  const LATER = new Date("2026-10-07T09:30:00.000Z");

  it("lets the author soft-delete their comment", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const deleted = await deleteComment(
      db,
      notifier,
      question.id,
      base.user.id,
      false,
      LATER
    );

    expect(deleted).toMatchObject({
      id: question.id,
      body: "Why?",
      deletedAt: "2026-10-07T09:30:00.000Z",
    });
  });

  it("refuses someone who is neither the author nor staff", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    await expect(
      deleteComment(db, notifier, question.id, base.instructor.id, false, LATER)
    ).rejects.toThrow("You can only delete your own comments");
  });

  it("lets staff soft-delete someone else's comment", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const deleted = await deleteComment(
      db,
      notifier,
      question.id,
      base.instructor.id,
      true,
      LATER
    );

    expect(deleted.deletedAt).toBe("2026-10-07T09:30:00.000Z");
  });

  it("leaves an already deleted comment as it was", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );
    await deleteComment(db, notifier, question.id, base.user.id, false, NOW);

    const again = await deleteComment(
      db,
      notifier,
      question.id,
      base.user.id,
      false,
      LATER
    );

    expect(again.deletedAt).toBe("2026-10-06T12:00:00.000Z");
  });

  it("refuses a comment that does not exist", async () => {
    await expect(
      deleteComment(db, notifier, 999, base.user.id, true, LATER)
    ).rejects.toThrow("Comment not found");
  });
});

describe("Discussion Question Notification", () => {
  it("tells the course's Instructor a Student asked a question", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "  How do   closures work?  ",
      NOW
    );

    expect(notifier.triggers).toEqual([
      {
        kind: "discussion-question",
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            avatarUrl: null,
          },
        ],
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        data: {
          commentId: question.id,
          courseSlug: "test-course",
          courseTitle: "Test Course",
          lessonId,
          lessonTitle: "Lesson 1",
          snippet: "How do closures work?",
        },
        idempotencyKey: `discussion-question:${question.id}`,
      },
    ]);
  });

  it("tells the Instructor a Platform Admin asked a question", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Platform Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    await createComment(
      db,
      notifier,
      admin.id,
      lessonId,
      null,
      "Is this lesson up to date?",
      NOW
    );

    expect(
      notifier.triggers.map((t) => [
        t.kind,
        t.recipients.map((r) => r.id),
        t.actor?.id,
      ])
    ).toEqual([["discussion-question", [base.instructor.id], admin.id]]);
  });

  it("tells nobody when the Instructor posts a top-level comment", async () => {
    await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      null,
      "Welcome to the lesson!",
      NOW
    );

    expect(notifier.triggers).toEqual([]);
  });
});

describe("Archiving Notifications when a comment is deleted", () => {
  const LATER = new Date("2026-10-07T09:30:00.000Z");

  it("removes the Discussion Question Notification from the Instructor's feed", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    expect(notifier.feed(base.instructor.id)).toHaveLength(1);

    await deleteComment(db, notifier, question.id, base.user.id, false, LATER);

    expect(notifier.feed(base.instructor.id)).toEqual([]);
  });

  it("removes the Discussion Reply Notification from the question author's feed", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    const reply = await createComment(
      db,
      notifier,
      base.instructor.id,
      lessonId,
      question.id,
      "Here is how.",
      NOW
    );
    expect(notifier.feed(base.user.id)).toHaveLength(1);

    await deleteComment(
      db,
      notifier,
      reply.id,
      base.instructor.id,
      true,
      LATER
    );

    expect(notifier.feed(base.user.id)).toEqual([]);
  });

  it("leaves the Discussion Reply Notifications under a deleted question", async () => {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const question = await createComment(
      db,
      notifier,
      other.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    const reply = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      question.id,
      "Good question.",
      NOW
    );

    await deleteComment(db, notifier, question.id, other.id, false, LATER);

    expect(notifier.feed(base.instructor.id)).toEqual([]);
    expect(
      notifier.feed(other.id).map((t) => [t.kind, t.data.commentId])
    ).toEqual([["discussion-reply", reply.id]]);
  });

  it("leaves Notifications alone when deleting fails", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );

    await expect(
      deleteComment(db, notifier, question.id, base.instructor.id, false, LATER)
    ).rejects.toThrow("You can only delete your own comments");

    expect(notifier.feed(base.instructor.id)).toHaveLength(1);
  });

  it("still deletes the comment when archiving fails", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );
    notifier.failWith(new Error("Knock is down"));

    const deleted = await deleteComment(
      db,
      notifier,
      question.id,
      base.user.id,
      false,
      LATER
    );

    expect(deleted.deletedAt).toBe("2026-10-07T09:30:00.000Z");
  });

  it("triggers and archives nothing when a comment is edited", async () => {
    const question = await createComment(
      db,
      notifier,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW
    );

    const edited = editComment(
      db,
      question.id,
      base.user.id,
      "How do closures work in loops?",
      LATER
    );

    expect(edited).toMatchObject({
      body: "How do closures work in loops?",
      editedAt: "2026-10-07T09:30:00.000Z",
    });
    expect(notifier.triggers).toHaveLength(1);
    expect(notifier.feed(base.instructor.id)).toMatchObject([
      { data: { snippet: "How do closures work?" } },
    ]);
  });
});
