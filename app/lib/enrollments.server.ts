import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { courses, enrollments } from "~/db/schema";
import {
  sendSafely,
  findNotificationPerson,
  type Notifications,
} from "~/lib/notifications.server";

// See docs/adr/0004 for why an Enrollment is not tied to a Purchase.

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Enrollment = typeof enrollments.$inferSelect;

export function isEnrolled(
  db: Queryable,
  studentId: number,
  courseId: number
): boolean {
  return !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, studentId), eq(enrollments.courseId, courseId))
    )
    .get();
}

export type EnrollResult =
  { ok: true; enrollment: Enrollment } | { ok: false; error: string };

/** A Notification failure is logged and never fails the Enrollment. */
export async function enrollStudent(
  db: Db,
  studentId: number,
  courseId: number,
  now: Date,
  notifications: Notifications
): Promise<EnrollResult> {
  const result = enrollStudentInTransaction(db, studentId, courseId, now);
  if (result.ok) {
    await notifyInstructorOfEnrollment(db, result.enrollment, notifications);
  }
  return result;
}

/**
 * The write half of `enrollStudent`, for callers that enrol inside their own
 * transaction. Once that transaction commits, they must call
 * `notifyInstructorOfEnrollment` with the new Enrollment.
 */
export function enrollStudentInTransaction(
  db: Queryable,
  studentId: number,
  courseId: number,
  now: Date
): EnrollResult {
  if (isEnrolled(db, studentId, courseId)) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const course = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    return { ok: false, error: "Course not found" };
  }

  const enrollment = db
    .insert(enrollments)
    .values({ userId: studentId, courseId, enrolledAt: now.toISOString() })
    .returning()
    .get();

  return { ok: true, enrollment };
}

/**
 * The Instructor's Enrollments preference is off until they opt in; Knock
 * applies it, not this code.
 */
export async function notifyInstructorOfEnrollment(
  db: Db,
  enrollment: Enrollment,
  notifications: Notifications
) {
  const course = db
    .select({ title: courses.title, instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .get();
  if (!course) return;
  const recipient = findNotificationPerson(db, course.instructorId);
  const actor = findNotificationPerson(db, enrollment.userId);
  if (!recipient || !actor) return;

  await sendSafely(
    notifications,
    {
      kind: "new-enrollment",
      recipient,
      actor,
      data: {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: course.title,
        url: `/instructor/${enrollment.courseId}/students`,
      },
    },
    `enrollment:${enrollment.id}`
  );
}
