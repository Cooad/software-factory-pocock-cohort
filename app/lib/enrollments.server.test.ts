import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createEnrollment } from "./enrollments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("creating an Enrollment", () => {
  it("enrolls the buyer of an Individual Purchase", () => {
    db.insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900 })
      .run();

    const result = createEnrollment(db, base.user.id, base.course.id, NOW);

    expect(result).toMatchObject({
      ok: true,
      enrollment: {
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: NOW.toISOString(),
      },
    });
  });

  it("refuses a Student who already has an Enrollment on the course", () => {
    createEnrollment(db, base.user.id, base.course.id, NOW);

    const result = createEnrollment(db, base.user.id, base.course.id, NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("enrolls a Lapsed Student again", () => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();
    const first = createEnrollment(db, base.user.id, base.course.id, NOW);
    if (!first.ok) throw new Error(first.error);
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.Completed,
      })
      .run();
    // An approved Refund Request ends the Enrollment but keeps the progress.
    db.delete(schema.enrollments).run();

    const later = new Date(2026, 10, 1, 9, 0, 0);
    const result = createEnrollment(db, base.user.id, base.course.id, later);

    expect(result).toMatchObject({
      ok: true,
      enrollment: { userId: base.user.id, enrolledAt: later.toISOString() },
    });
  });

  it("refuses a course that doesn't exist", () => {
    const result = createEnrollment(db, base.user.id, 9999, NOW);

    expect(result).toEqual({ ok: false, error: "Course not found" });
  });
});
