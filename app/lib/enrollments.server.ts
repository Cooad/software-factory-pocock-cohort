import { and, eq } from "drizzle-orm";
import { courses, enrollments } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

// ─── Enrollment service ───
// Creating an Enrollment, whatever it came from: an Individual Purchase, a
// Claimed Seat, or a Lapsed Student enrolling again (ADR 0004: an Enrollment
// is not tied to a Purchase). Takes the database and `now` so tests can hand
// in an in-memory database and a fixed clock.

type Enrollment = typeof enrollments.$inferSelect;

export type CreateEnrollmentResult =
  | { ok: true; enrollment: Enrollment }
  | { ok: false; error: string };

export const ALREADY_ENROLLED = "You are already enrolled in this course";

export function isEnrolled(db: Db, userId: number, courseId: number): boolean {
  return !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

export function createEnrollment(
  db: Db,
  userId: number,
  courseId: number,
  now: Date
): CreateEnrollmentResult {
  const course = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    return { ok: false, error: "Course not found" };
  }

  if (isEnrolled(db, userId, courseId)) {
    return { ok: false, error: ALREADY_ENROLLED };
  }

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId, enrolledAt: now.toISOString() })
    .returning()
    .get();

  return { ok: true, enrollment };
}
