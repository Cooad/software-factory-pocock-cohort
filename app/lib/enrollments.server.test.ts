import { eq } from "drizzle-orm";
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createEnrollment, isEnrolled } from "./enrollments.server";
import { buyCourse, buyTeamLicence } from "./purchases.server";
import { claimSeat } from "./seats.server";
import { syncUser } from "./notifications.server";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notification-preferences";
import { createFakeNotifier, type FakeNotifier } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let notifier: FakeNotifier;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  notifier = createFakeNotifier();
  base = seedBaseData(db);
});

describe("creating an Enrollment", () => {
  it("enrolls the buyer of an Individual Purchase", async () => {
    db.insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900 })
      .run();

    const result = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    expect(result).toMatchObject({
      ok: true,
      enrollment: {
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: NOW.toISOString(),
      },
    });
  });

  it("refuses a Student who already has an Enrollment on the course", async () => {
    await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    const result = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("enrolls a Lapsed Student again", async () => {
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
    const first = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);
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
    const result = await createEnrollment(db, notifier, base.user.id, base.course.id, later);

    expect(result).toMatchObject({
      ok: true,
      enrollment: { userId: base.user.id, enrolledAt: later.toISOString() },
    });
  });

  it("refuses a course that doesn't exist", async () => {
    const result = await createEnrollment(db, notifier, base.user.id, 9999, NOW);

    expect(result).toEqual({ ok: false, error: "Course not found" });
  });
});

describe("creating an Enrollment: the New Enrollment Notification", () => {
  it("tells the course's Instructor which Student enrolled in which course", async () => {
    db.insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900 })
      .run();

    const result = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);
    if (!result.ok) throw new Error(result.error);

    expect(notifier.triggers).toEqual([
      {
        kind: "new-enrollment",
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
          enrollmentId: result.enrollment.id,
          courseId: base.course.id,
          courseSlug: "test-course",
          courseTitle: "Test Course",
        },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("tells the Instructor when a Student buys the course", async () => {
    const result = await buyCourse(db, notifier, base.user.id, base.course.id, 7900, "PL", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(enrollmentTriggers()).toMatchObject([
      {
        recipients: [{ id: base.instructor.id }],
        actor: { id: base.user.id },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("doesn't tell the Instructor about a Team Licence until a Seat is claimed", async () => {
    const buyer = db
      .insert(schema.users)
      .values({ name: "Tara", email: "tara@example.com", role: schema.UserRole.Student })
      .returning()
      .get();

    const { coupons } = buyTeamLicence(db, buyer.id, base.course.id, 15800, "PL", 2);

    // Buying a Team Licence enrolls nobody, so nobody is notified yet.
    expect(isEnrolled(db, buyer.id, base.course.id)).toBe(false);

    const claimed = await claimSeat(db, notifier, coupons[0].code, base.user.id, "PL", NOW);
    if (!claimed.ok) throw new Error(claimed.error);

    expect(enrollmentTriggers()).toMatchObject([
      { actor: { id: base.user.id }, idempotencyKey: `enrollment:${claimed.enrollment.id}` },
    ]);
  });

  it("tells the Instructor when a Student claims a Seat", async () => {
    const buyer = db
      .insert(schema.users)
      .values({ name: "Tara", email: "tara@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    const licence = db
      .insert(schema.purchases)
      .values({ userId: buyer.id, courseId: base.course.id, amountPaid: 15800, country: "PL" })
      .returning()
      .get();
    db.insert(schema.coupons)
      .values({ teamId: team.id, courseId: base.course.id, code: "SEAT-1", purchaseId: licence.id })
      .run();

    const result = await claimSeat(db, notifier, "SEAT-1", base.user.id, "PL", NOW);
    if (!result.ok) throw new Error(result.error);

    expect(enrollmentTriggers()).toMatchObject([
      {
        recipients: [{ id: base.instructor.id }],
        actor: { id: base.user.id },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("tells the Instructor again when a Lapsed Student enrolls again", async () => {
    const first = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);
    if (!first.ok) throw new Error(first.error);
    // An approved Refund Request ends the Enrollment.
    db.delete(schema.enrollments).run();

    const again = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);
    if (!again.ok) throw new Error(again.error);

    expect(enrollmentTriggers().map((t) => t.idempotencyKey)).toEqual([
      `enrollment:${first.enrollment.id}`,
      `enrollment:${again.enrollment.id}`,
    ]);
    expect(again.enrollment.id).not.toBe(first.enrollment.id);
  });

  it("doesn't tell the Instructor about enrolling in their own course", async () => {
    await createEnrollment(db, notifier, base.instructor.id, base.course.id, NOW);

    expect(enrollmentTriggers()).toEqual([]);
  });

  it("notifies nobody when the Enrollment is refused", async () => {
    await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);
    notifier.triggers.length = 0;

    await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    expect(notifier.triggers).toEqual([]);
  });

  it("still enrolls the Student when Notifications fail", async () => {
    notifier.failWith(new Error("Knock is down"));

    const result = await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    expect(result).toMatchObject({ ok: true, enrollment: { userId: base.user.id } });
  });
});

describe("the New Enrollment Notification is off by default", () => {
  beforeEach(async () => {
    await syncUser(notifier, { ...base.instructor, avatarUrl: null });
  });

  it("doesn't reach an Instructor with the default preferences", async () => {
    await buyCourse(db, notifier, base.user.id, base.course.id, 7900, "PL", NOW);

    expect(enrollmentTriggers()).toHaveLength(1);
    expect(notifier.feed(base.instructor.id)).toEqual([]);
  });

  it("reaches the Instructor's feed from every source once they opt in", async () => {
    await notifier.setPreferences(base.instructor.id, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enrollments: { feed: true },
    });
    const buyer = db
      .insert(schema.users)
      .values({ name: "Tara", email: "tara@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    const lapsed = db
      .insert(schema.users)
      .values({ name: "Lee", email: "lee@example.com", role: schema.UserRole.Student })
      .returning()
      .get();

    await buyCourse(db, notifier, base.user.id, base.course.id, 7900, "PL", NOW);
    const { coupons } = buyTeamLicence(db, buyer.id, base.course.id, 15800, "PL", 1);
    await claimSeat(db, notifier, coupons[0].code, lapsed.id, "PL", NOW);
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.userId, lapsed.id))
      .run();
    await createEnrollment(db, notifier, lapsed.id, base.course.id, NOW);

    expect(
      notifier.feed(base.instructor.id).map((t) => [t.kind, t.actor?.name])
    ).toEqual([
      ["new-enrollment", "Test User"],
      ["new-enrollment", "Lee"],
      ["new-enrollment", "Lee"],
    ]);
  });
});

function enrollmentTriggers() {
  return notifier.triggers.filter((t) => t.kind === "new-enrollment");
}
