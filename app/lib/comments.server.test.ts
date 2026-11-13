import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date("2026-10-06T12:00:00.000Z");

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
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
  it("creates a Discussion Question on a lesson", () => {
    const question = createComment(
      db,
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

  it("creates a Discussion Reply to a question on the same lesson", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const reply = createComment(
      db,
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

  it("refuses a reply to a reply, keeping replies one level deep", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Because.",
      NOW
    );

    expect(() =>
      createComment(db, base.user.id, lessonId, reply.id, "But why?", NOW)
    ).toThrow("Replies can only be one level deep");
  });

  it("refuses a reply to a question on a different lesson", () => {
    const question = createComment(
      db,
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

    expect(() =>
      createComment(
        db,
        base.instructor.id,
        otherLessonId,
        question.id,
        "Because.",
        NOW
      )
    ).toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses an empty body", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, null, "   ", NOW)
    ).toThrow("Comment cannot be empty");
  });
});

describe("deleteComment", () => {
  const LATER = new Date("2026-10-07T09:30:00.000Z");

  it("lets the author soft-delete their comment", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const deleted = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(deleted).toMatchObject({
      id: question.id,
      body: "Why?",
      deletedAt: "2026-10-07T09:30:00.000Z",
    });
  });

  it("refuses someone who is neither the author nor staff", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    expect(() =>
      deleteComment(db, question.id, base.instructor.id, false, LATER)
    ).toThrow("You can only delete your own comments");
  });

  it("lets staff soft-delete someone else's comment", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );

    const deleted = deleteComment(
      db,
      question.id,
      base.instructor.id,
      true,
      LATER
    );

    expect(deleted.deletedAt).toBe("2026-10-07T09:30:00.000Z");
  });

  it("leaves an already deleted comment as it was", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why?",
      NOW
    );
    deleteComment(db, question.id, base.user.id, false, NOW);

    const again = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(again.deletedAt).toBe("2026-10-06T12:00:00.000Z");
  });

  it("refuses a comment that does not exist", () => {
    expect(() => deleteComment(db, 999, base.user.id, true, LATER)).toThrow(
      "Comment not found"
    );
  });
});
