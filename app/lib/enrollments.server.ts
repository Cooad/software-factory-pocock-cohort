import { and, eq } from "drizzle-orm";
import { courses, enrollments, users } from "~/db/schema";
import {
  notifySafely,
  type NotificationPerson,
  type Notifier,
} from "~/lib/notifications.server";
import type { Db } from "~/lib/refunds.server";

// ─── Enrollment service ───
// Creating an Enrollment, whatever it came from: an Individual Purchase, a
// Claimed Seat, or a Lapsed Student enrolling again (ADR 0004: an Enrollment
// is not tied to a Purchase). Buying a Team Licence creates no Enrollment, so
// it never comes through here. Takes the database first, the `Notifier` port
// second and `now` last, so tests can hand in an in-memory database, the fake
// adapter and a fixed clock. The New Enrollment Notification is sent after the
// Enrollment is written and never fails it.

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

function getPerson(db: Db, userId: number): NotificationPerson | undefined {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/**
 * Notification 5: tells the course's Instructor which Student enrolled. The
 * Enrollments category is off by default (see `notification-preferences.ts`),
 * so the vendor drops it unless the Instructor opted in.
 */
async function notifyNewEnrollment(
  db: Db,
  notifier: Notifier,
  enrollment: Enrollment
) {
  const course = db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      instructorId: courses.instructorId,
    })
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .get();
  // Notifications are about what someone else did.
  if (!course || course.instructorId === enrollment.userId) return;

  const recipient = getPerson(db, course.instructorId);
  const actor = getPerson(db, enrollment.userId);
  if (!recipient || !actor) return;

  await notifySafely(notifier, {
    kind: "new-enrollment",
    recipients: [recipient],
    actor,
    data: {
      enrollmentId: enrollment.id,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
    },
    idempotencyKey: `enrollment:${enrollment.id}`,
  });
}

/** Enrolls a Student in a course and notifies the course's Instructor. */
export async function createEnrollment(
  db: Db,
  notifier: Notifier,
  userId: number,
  courseId: number,
  now: Date
): Promise<CreateEnrollmentResult> {
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

  await notifyNewEnrollment(db, notifier, enrollment);

  return { ok: true, enrollment };
}
