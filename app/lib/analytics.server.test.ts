import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, createUserWithRole, seedBaseData } from "~/test/setup";
import { CourseStatus, UserRole } from "~/db/schema";
import { createCourse, setCourseStatus } from "./courses.server";
import { createStudent } from "./users.server";
import { enrollStudentInTransaction } from "./enrollments.server";
import {
  createIndividualPurchase,
  createTeamLicence,
} from "./purchases.server";
import { claimSeat } from "./seat-claims.server";
import { fakeNotifications } from "./notifications.fake.server";
import { getInstructorAnalytics } from "./analytics.server";
import type { AnalyticsRange } from "./analytics";

type TestDb = ReturnType<typeof createTestDb>;

// Local time, like the refund window it is checked against: the window is
// counted in calendar days, not hours.
const NOW = new Date(2026, 9, 20, 12, 0, 0);

function daysBefore(days: number, hour = 12) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  when.setHours(hour, 0, 0, 0);
  return when;
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let otherInstructor: ReturnType<typeof createUserWithRole>;
let otherCourse: { id: number };
let admin: ReturnType<typeof createUserWithRole>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  otherInstructor = createUserWithRole(
    db,
    "Other Instructor",
    "other@example.com",
    UserRole.Instructor
  );
  const draft = createCourse(
    db,
    "Other Course",
    "other-course",
    "Another course",
    "## Other\n\nSales copy.",
    otherInstructor.id,
    base.category.id,
    null
  );
  otherCourse = setCourseStatus(db, draft.id, CourseStatus.Published, NOW);

  admin = createUserWithRole(db, "Admin", "admin@example.com", UserRole.Admin);
});

function asInstructor(
  requestedInstructorId: number | null = null,
  requestedCourseId: number | null = null,
  range: AnalyticsRange = "30d"
) {
  return getInstructorAnalytics(
    db,
    { userId: base.instructor.id, isAdmin: false },
    range,
    requestedInstructorId,
    requestedCourseId,
    NOW
  );
}

function asAdmin(
  requestedInstructorId: number | null,
  requestedCourseId: number | null = null
) {
  return getInstructorAnalytics(
    db,
    { userId: admin.id, isAdmin: true },
    "30d",
    requestedInstructorId,
    requestedCourseId,
    NOW
  );
}

function buy(courseId: number, amountPaid: number, when: Date) {
  return createIndividualPurchase(
    db,
    base.user.id,
    courseId,
    amountPaid,
    "US",
    when
  );
}

describe("getInstructorAnalytics", () => {
  describe("whose figures the viewer sees", () => {
    beforeEach(() => {
      buy(base.course.id, 1000, daysBefore(1));
      buy(otherCourse.id, 5000, daysBefore(1));
    });

    it("pins an instructor to their own courses, whoever they ask for", () => {
      const result = asInstructor(otherInstructor.id);

      expect(result.instructorId).toBe(base.instructor.id);
      expect(result.summary.grossCents).toBe(1000);
      expect(result.instructors).toEqual([]);
    });

    it("shows an admin who asks for nobody every instructor's sales", () => {
      const result = asAdmin(null);

      expect(result.instructorId).toBeNull();
      expect(result.summary.grossCents).toBe(6000);
      expect(result.instructors.map((one) => one.id).sort()).toEqual(
        [base.instructor.id, otherInstructor.id].sort()
      );
    });

    it("lets an admin narrow to one instructor", () => {
      const result = asAdmin(otherInstructor.id);

      expect(result.instructorId).toBe(otherInstructor.id);
      expect(result.summary.grossCents).toBe(5000);
    });
  });

  describe("which course the detail tab opens", () => {
    it("drops a course the instructor does not own", () => {
      const result = asInstructor(null, otherCourse.id);

      expect(result.selectedCourseId).toBeNull();
      expect(result.progress).toBeNull();
      expect(result.funnel).toBeNull();
      expect(result.countries).toBeNull();
    });

    it("drops another instructor's course when an admin has narrowed to one", () => {
      const result = asAdmin(base.instructor.id, otherCourse.id);

      expect(result.instructorId).toBe(base.instructor.id);
      expect(result.selectedCourseId).toBeNull();
    });

    it("lets an admin with no instructor picked open any course", () => {
      const result = asAdmin(null, otherCourse.id);

      expect(result.selectedCourseId).toBe(otherCourse.id);
    });

    it("opens a course the instructor owns", () => {
      const result = asInstructor(null, base.course.id);

      expect(result.selectedCourseId).toBe(base.course.id);
      expect(result.progress).not.toBeNull();
    });
  });

  describe("the date range", () => {
    it("includes a sale exactly on the cutoff and excludes one just before", () => {
      const cutoff = new Date(NOW.getTime() - 30 * 86_400_000);
      buy(base.course.id, 1000, cutoff);
      buy(base.course.id, 2000, new Date(cutoff.getTime() - 1));

      const result = asInstructor();

      expect(result.summary.purchaseCount).toBe(1);
      expect(result.summary.grossCents).toBe(1000);
    });

    it("charts the whole window, ending today, even before the first sale", () => {
      buy(base.course.id, 1000, daysBefore(1));

      const { series } = asInstructor(null, null, "7d");
      const today = NOW.toISOString().slice(0, 10);
      const weekAgo = new Date(NOW.getTime() - 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      expect(series.granularity).toBe("day");
      expect(series.points[0].bucket).toBe(weekAgo);
      expect(series.points.at(-1)?.bucket).toBe(today);
    });
  });

  describe("refund exposure", () => {
    it("keeps a late-evening purchase exposed through its fourteenth day", () => {
      buy(base.course.id, 1000, daysBefore(14, 23));

      // Viewed at 23:30, past the 24-hour mark: only a window counted in
      // calendar days still has this purchase open.
      const lateOnDay14 = new Date(NOW);
      lateOnDay14.setHours(23, 30, 0, 0);

      const { refundExposure } = getInstructorAnalytics(
        db,
        { userId: base.instructor.id, isAdmin: false },
        "30d",
        null,
        null,
        lateOnDay14
      );

      expect(refundExposure.purchaseCount).toBe(1);
      expect(refundExposure.closingTodayCount).toBe(1);
      expect(refundExposure.courses[0].daysLeft).toBe(0);
    });

    it("stops counting a purchase once its window has closed", () => {
      buy(base.course.id, 1000, daysBefore(15));

      const { refundExposure, summary } = asInstructor();

      expect(summary.purchaseCount).toBe(1);
      expect(refundExposure.purchaseCount).toBe(0);
      expect(refundExposure.grossCents).toBe(0);
    });

    it("reports the most urgent purchase as a course's days left", () => {
      buy(base.course.id, 1000, daysBefore(2));
      buy(base.course.id, 1000, daysBefore(10));

      const { refundExposure } = asInstructor();

      expect(refundExposure.courses).toHaveLength(1);
      expect(refundExposure.courses[0].daysLeft).toBe(4);
      expect(refundExposure.sharePercent).toBe(100);
    });
  });

  describe("revenue per student", () => {
    it("splits a team licence across its seats without rounding drift", async () => {
      const { seats } = createTeamLicence(
        db,
        base.user.id,
        base.course.id,
        1000,
        "US",
        3,
        daysBefore(1)
      );

      const claimers = ["a", "b", "c"].map((name) =>
        createStudent(db, name, `${name}@example.com`)
      );
      for (const [index, claimer] of claimers.entries()) {
        await claimSeat(
          db,
          seats[index].code,
          claimer.id,
          "US",
          daysBefore(1),
          fakeNotifications()
        );
      }

      const { audience } = asInstructor();

      expect(audience.buyerCount).toBe(1);
      expect(audience.studentCount).toBe(3);
      expect(audience.revenuePerStudentCents).toBe(333);
    });

    it("counts an enrolled buyer once", () => {
      buy(base.course.id, 1000, daysBefore(1));
      enrollStudentInTransaction(
        db,
        base.user.id,
        base.course.id,
        daysBefore(1)
      );

      const { audience } = asInstructor();

      expect(audience.studentCount).toBe(1);
      expect(audience.revenuePerStudentCents).toBe(1000);
    });
  });
});
