import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { createCoursePermissions } from "../course-permissions.server";
import type { Person } from "../person.server";

let db: TestDb;
let permissions: ReturnType<typeof createCoursePermissions>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  permissions = createCoursePermissions(db);
});

// ─── Fixtures ───

function student(country: string | null): Person {
  return { id: base.user.id, role: "student", country };
}

let slugCounter = 0;
function addPppCourse() {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title: `Other Course ${slugCounter}`,
      slug: `other-course-${slugCounter}`,
      description: "Another course",
      salesCopy: base.course.salesCopy,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
      price: 10000,
      pppEnabled: true,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

function buy(
  userId: number,
  courseId: number,
  purchase: { country: string; createdAt?: string }
) {
  return db
    .insert(schema.purchases)
    .values({
      userId,
      courseId,
      amountPaid: 5000,
      country: purchase.country,
      createdAt: purchase.createdAt ?? "2026-01-01T00:00:00.000Z",
    })
    .returning()
    .get();
}

function grantSeat(purchaseId: number, courseId: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId,
      code: `SEAT-${purchaseId}`,
      purchaseId,
    })
    .run();
}

function courseRow(courseId: number) {
  const course = db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) throw new Error(`No course ${courseId}`);
  return course;
}

function lockedIds(person: Person, courseIds: number[]) {
  return [
    ...permissions.findCountryLockedCourseIds(person, courseIds.map(courseRow)),
  ].sort();
}

// ─── Behaviour ───

describe("findCountryLockedCourseIds", () => {
  it("names only the courses under Country Lock, out of several", () => {
    const lockedCourse = addPppCourse();
    const homeCourse = addPppCourse();
    for (const course of [lockedCourse, homeCourse]) {
      enroll(base.user.id, course.id);
    }
    buy(base.user.id, lockedCourse.id, { country: "IN" });
    buy(base.user.id, homeCourse.id, { country: "US" });

    expect(lockedIds(student("US"), [lockedCourse.id, homeCourse.id])).toEqual([
      lockedCourse.id,
    ]);
  });

  it("agrees with decide for each course", () => {
    const course = addPppCourse();
    enroll(base.user.id, course.id);
    buy(base.user.id, course.id, { country: "IN" });

    const decision = permissions.decide(student("US"), { courseId: course.id });
    expect(decision).toMatchObject({
      take: { allowed: false, reason: { kind: "country-lock" } },
    });
    expect(lockedIds(student("US"), [course.id])).toEqual([course.id]);
  });

  it("names nothing without an Enrollment", () => {
    const course = addPppCourse();
    buy(base.user.id, course.id, { country: "IN" });

    expect(lockedIds(student("US"), [course.id])).toEqual([]);
  });

  it("judges against the newest Individual Purchase only", () => {
    const course = addPppCourse();
    enroll(base.user.id, course.id);
    buy(base.user.id, course.id, { country: "IN" });
    buy(base.user.id, course.id, {
      country: "US",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    expect(lockedIds(student("US"), [course.id])).toEqual([]);
  });

  it("skips a Team Licence, even a newer one", () => {
    const course = addPppCourse();
    enroll(base.user.id, course.id);
    buy(base.user.id, course.id, { country: "US" });
    const licence = buy(base.user.id, course.id, {
      country: "IN",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    grantSeat(licence.id, course.id);

    expect(lockedIds(student("US"), [course.id])).toEqual([]);
  });

  it("exempts the owning Instructor and Platform Admins", () => {
    const course = addPppCourse();
    enroll(base.instructor.id, course.id);
    buy(base.instructor.id, course.id, { country: "IN" });
    enroll(base.user.id, course.id);
    buy(base.user.id, course.id, { country: "IN" });

    const instructor: Person = {
      id: base.instructor.id,
      role: "instructor",
      country: "US",
    };
    const admin: Person = { ...student("US"), role: "platform-admin" };
    expect(lockedIds(instructor, [course.id])).toEqual([]);
    expect(lockedIds(admin, [course.id])).toEqual([]);
  });

  it("names nothing for no courses", () => {
    expect(lockedIds(student("US"), [])).toEqual([]);
  });
});
