import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import { claimSeat } from "~/lib/seat-claims.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import type { Person } from "~/modules/permissions/person.server";
import { createCourseCatalog, type CatalogQuery } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let catalog: ReturnType<typeof createCourseCatalog>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  catalog = createCourseCatalog(db);
});

// ─── Fixtures ───

const NOW = new Date("2026-03-01T00:00:00.000Z");
const ALL: CatalogQuery = { search: null, category: null, owned: false };
const OWNED: CatalogQuery = { ...ALL, owned: true };

function student(country: string | null = null): Person {
  return { id: base.user.id, role: "student", country };
}

let userCounter = 0;
function addStudent() {
  userCounter += 1;
  return db
    .insert(schema.users)
    .values({
      name: `Student ${userCounter}`,
      email: `student${userCounter}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

let slugCounter = 0;
function addCourse(title = "Other Course") {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `other-course-${slugCounter}`,
      description: "Another course",
      salesCopy: base.course.salesCopy,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function enroll(userId = base.user.id, courseId = base.course.id) {
  const result = enrollStudentInTransaction(db, userId, courseId, NOW);
  if (!result.ok) throw new Error(result.error);
}

function setPppPrice(price: number, courseId = base.course.id) {
  db.update(schema.courses)
    .set({ price, pppEnabled: true })
    .where(eq(schema.courses.id, courseId))
    .run();
}

function buy(userId: number, country: string | null) {
  return db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 5000,
      country,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    .returning()
    .get();
}

/** A Team Licence with one Seat; returns the Seat code. */
function buyTeamLicence(userId: number, country: string | null) {
  const purchase = buy(userId, country);
  const team = db.insert(schema.teams).values({}).returning().get();
  const code = `SEAT-${purchase.id}`;
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code,
      purchaseId: purchase.id,
    })
    .run();
  return code;
}

function badges(person: Person | null, query = ALL) {
  return Object.fromEntries(
    catalog
      .browse({ person, country: person?.country ?? null }, query)
      .courses.map((c) => [c.title, c.badge])
  );
}

function titles(person: Person | null, query: CatalogQuery) {
  return catalog
    .browse({ person, country: null }, query)
    .courses.map((c) => c.title);
}

// ─── Badges ───

describe("browse: badges", () => {
  it("gives a signed-out visitor no badges", () => {
    enroll();
    expect(badges(null)).toEqual({ "Test Course": null });
  });

  it("marks a course the Student is enrolled on at 0% progress as Enrolled", () => {
    addCourse("Not Bought");
    enroll();

    const result = catalog.browse({ person: student(), country: null }, ALL);
    const course = result.courses.find((c) => c.title === "Test Course");
    expect(course).toMatchObject({ badge: "enrolled", progress: 0 });
    expect(badges(student())).toEqual({
      "Test Course": "enrolled",
      "Not Bought": null,
    });
  });

  it("gives a Lapsed Student, whose Enrollment was removed, no badge", () => {
    enroll();
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.userId, base.user.id))
      .run();

    expect(badges(student())).toEqual({ "Test Course": null });
  });

  it("marks a Purchasing-Power Price purchase used from another country as Locked", () => {
    setPppPrice(10000);
    buy(base.user.id, "IN");
    enroll();

    expect(badges(student("US"))).toEqual({ "Test Course": "locked" });
    expect(badges(student("IN"))).toEqual({ "Test Course": "enrolled" });
  });

  it("doesn't lock a Claimed Seat viewed from abroad", async () => {
    setPppPrice(10000);
    const teamAdmin = addStudent();
    const code = buyTeamLicence(teamAdmin.id, null);
    const claimed = await claimSeat(
      db,
      code,
      base.user.id,
      null,
      NOW,
      fakeNotifications()
    );
    expect(claimed.ok).toBe(true);

    expect(badges(student("US"))).toEqual({ "Test Course": "enrolled" });
  });

  it("gives a Team Licence alone no badge", () => {
    buyTeamLicence(base.user.id, null);
    expect(badges(student())).toEqual({ "Test Course": null });
  });

  it("marks a Team Admin who is also enrolled as Enrolled", () => {
    buyTeamLicence(base.user.id, null);
    enroll();
    expect(badges(student())).toEqual({ "Test Course": "enrolled" });
  });

  it("shows Your Course, not Enrolled, to the course's Instructor", () => {
    enroll(base.instructor.id);
    const instructor: Person = {
      id: base.instructor.id,
      role: "instructor",
      country: null,
    };
    expect(badges(instructor)).toEqual({ "Test Course": "your-course" });
  });

  it("lists a course once when the Student has duplicate Enrollment rows", () => {
    enroll();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    const { courses } = catalog.browse(
      { person: student(), country: null },
      OWNED
    );
    expect(courses.map((c) => [c.title, c.badge])).toEqual([
      ["Test Course", "enrolled"],
    ]);
  });
});

// ─── Owned filter ───

describe("browse: owned filter", () => {
  it("lists only courses the Student has an Enrollment on", () => {
    addCourse("Not Bought");
    enroll();

    expect(titles(student(), OWNED)).toEqual(["Test Course"]);
    expect(titles(student(), ALL)).toHaveLength(2);
  });

  it("includes a Locked course", () => {
    setPppPrice(10000);
    buy(base.user.id, "IN");
    enroll();
    addCourse("Not Bought");

    expect(titles(student("US"), OWNED)).toEqual(["Test Course"]);
  });

  it("lists nothing when the Student owns nothing", () => {
    expect(titles(student(), OWNED)).toEqual([]);
  });

  it("doesn't count a Team Licence alone as Owned", () => {
    buyTeamLicence(base.user.id, null);
    expect(titles(student(), OWNED)).toEqual([]);
  });

  it("is ignored when signed out", () => {
    expect(titles(null, OWNED)).toEqual(["Test Course"]);
    expect(catalog.browse({ person: null, country: null }, OWNED).owned).toBe(
      false
    );
  });

  it("says it was applied for a signed-in viewer", () => {
    const viewer = { person: student(), country: null };
    expect(catalog.browse(viewer, OWNED).owned).toBe(true);
    expect(catalog.browse(viewer, ALL).owned).toBe(false);
  });

  it("combines with the search", () => {
    const other = addCourse("Advanced Thing");
    enroll();
    enroll(base.user.id, other.id);

    expect(titles(student(), { ...OWNED, search: "Advanced" })).toEqual([
      "Advanced Thing",
    ]);
  });
});

// ─── Progress ───

function addLessons(count: number, courseId = base.course.id) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "A module", position: 1 })
    .returning()
    .get();
  return Array.from({ length: count }, (_, i) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: `Lesson ${i}`, position: i })
      .returning()
      .get()
  );
}

function complete(lessonId: number) {
  db.insert(schema.lessonProgress)
    .values({
      userId: base.user.id,
      lessonId,
      status: schema.LessonProgressStatus.Completed,
    })
    .run();
}

describe("browse: progress", () => {
  it("counts completed lessons on an enrolled course", () => {
    const [first] = addLessons(3);
    complete(first.id);
    enroll();

    const [course] = catalog.browse(
      { person: student(), country: null },
      ALL
    ).courses;
    expect(course).toMatchObject({
      lessonCount: 3,
      completedLessons: 1,
      progress: 33,
    });
  });

  it("ignores lessons and completions in other courses", () => {
    const other = addCourse("Other");
    const [otherLesson] = addLessons(4, other.id);
    complete(otherLesson.id);
    const [first] = addLessons(2);
    complete(first.id);
    enroll();

    const course = catalog
      .browse({ person: student(), country: null }, ALL)
      .courses.find((c) => c.title === "Test Course");
    expect(course).toMatchObject({
      lessonCount: 2,
      completedLessons: 1,
      progress: 50,
    });
  });

  it("gives a course with no lessons 0 lessons and 0%", () => {
    enroll();
    const [course] = catalog.browse(
      { person: student(), country: null },
      ALL
    ).courses;
    expect(course).toMatchObject({
      lessonCount: 0,
      completedLessons: 0,
      progress: 0,
    });
  });

  it("shows no progress once the Enrollment is gone", () => {
    const [first] = addLessons(2);
    complete(first.id);

    const [course] = catalog.browse(
      { person: student(), country: null },
      ALL
    ).courses;
    expect(course).toMatchObject({ progress: null, completedLessons: null });
  });

  it("prices a Purchasing-Power Price course for the viewer's country", () => {
    setPppPrice(10000);
    const [course] = catalog.browse(
      { person: null, country: "IN" },
      ALL
    ).courses;
    expect(course.pppPrice).toBeLessThan(course.price);
  });
});

// ─── Filters and ratings ───

function rate(courseId: number, rating: number) {
  const rater = addStudent();
  db.insert(schema.courseRatings)
    .values({ userId: rater.id, courseId, rating })
    .run();
}

describe("browse: filters and ratings", () => {
  it("lists only Published courses", () => {
    const draft = addCourse("Draft Course");
    db.update(schema.courses)
      .set({ status: schema.CourseStatus.Draft })
      .where(eq(schema.courses.id, draft.id))
      .run();
    expect(titles(null, ALL)).toEqual(["Test Course"]);
  });

  it("searches titles and descriptions", () => {
    addCourse("Unrelated");
    expect(titles(null, { ...ALL, search: "A test course" })).toEqual([
      "Test Course",
    ]);
  });

  it("filters by category slug and lists every category", () => {
    const design = db
      .insert(schema.categories)
      .values({ name: "Design", slug: "design" })
      .returning()
      .get();
    const other = addCourse("Design Course");
    db.update(schema.courses)
      .set({ categoryId: design.id })
      .where(eq(schema.courses.id, other.id))
      .run();

    expect(titles(null, { ...ALL, category: "design" })).toEqual([
      "Design Course",
    ]);
    const { categories } = catalog.browse({ person: null, country: null }, ALL);
    expect(categories.map((c) => c.slug)).toEqual(["design", "programming"]);
  });

  it("averages ratings to one decimal and counts them", () => {
    addCourse("Unrated");
    rate(base.course.id, 4);
    rate(base.course.id, 5);
    rate(base.course.id, 5);

    const ratings = Object.fromEntries(
      catalog
        .browse({ person: null, country: null }, ALL)
        .courses.map((c) => [c.title, [c.ratingAverage, c.ratingCount]])
    );
    expect(ratings).toEqual({
      "Test Course": [4.7, 3],
      Unrated: [null, 0],
    });
  });
});
