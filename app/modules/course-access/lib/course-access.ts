import { and, asc, eq, notExists } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  RefundStatus,
  UserRole,
  coupons,
  courses,
  purchases,
  refunds,
  users,
} from "~/db/schema";
import { isEnrolled } from "~/lib/enrollments.server";
import { purchaseRegionLocks } from "./purchasing-power-price";

export type Db = BetterSQLite3Database<typeof schema>;

export type Viewer = { userId: number | null; country: string | null };

export type CourseAccessDecision =
  | { kind: "allowed"; via: "manage" | "enrollment" }
  | { kind: "signed-out" }
  | { kind: "not-enrolled" }
  | {
      kind: "region-locked";
      purchaseCountry: string;
      currentCountry: string;
    }
  | { kind: "course-not-found" };

type Course = NonNullable<ReturnType<typeof getCourse>>;
type PersonRow = NonNullable<ReturnType<typeof getPerson>>;

function getCourse(db: Db, courseId: number) {
  return db
    .select({
      id: courses.id,
      instructorId: courses.instructorId,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
}

/** The signed-in person, or undefined when signed out or their row is gone. */
function getPerson(db: Db, viewer: Viewer) {
  if (viewer.userId === null) return undefined;
  return db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, viewer.userId))
    .get();
}

function managesCourse(person: PersonRow, course: Course) {
  return person.role === UserRole.Admin || course.instructorId === person.id;
}

/**
 * The countries of the Student's own Individual Purchases of the course that
 * have no Approved Refund Request, oldest first. A Team Licence is the
 * Purchase that granted Seats; it gives its buyer nothing to take.
 */
function getCountingPurchaseCountries(
  db: Db,
  person: PersonRow,
  course: Course
) {
  const seatOnPurchase = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchases.id));
  const approvedRefund = db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchases.id),
        eq(refunds.status, RefundStatus.Approved)
      )
    );
  return db
    .select({ country: purchases.country })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, person.id),
        eq(purchases.courseId, course.id),
        notExists(seatOnPurchase),
        notExists(approvedRefund)
      )
    )
    .orderBy(asc(purchases.createdAt), asc(purchases.id))
    .all()
    .map((purchase) => purchase.country);
}

function holdsClaimedSeat(db: Db, person: PersonRow, course: Course) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.redeemedByUserId, person.id),
        eq(coupons.courseId, course.id)
      )
    )
    .get();
}

/**
 * The country of the Purchase that Region-Locks the Student, or null when
 * they aren't Region-Locked.
 */
function regionLockedBy(
  db: Db,
  person: PersonRow,
  course: Course,
  currentCountry: string | null
): string | null {
  // ADR-0013: a Claimed Seat never Region-Locks.
  if (holdsClaimedSeat(db, person, course)) return null;
  const countries = getCountingPurchaseCountries(db, person, course);
  if (countries.length === 0) return null;
  const locking = countries.filter((country) =>
    purchaseRegionLocks(course, country, currentCountry)
  );
  if (locking.length < countries.length) return null;
  return locking[locking.length - 1];
}

export function decide(
  db: Db,
  viewer: Viewer,
  courseId: number
): CourseAccessDecision {
  const course = getCourse(db, courseId);
  if (!course) return { kind: "course-not-found" };
  const person = getPerson(db, viewer);
  if (!person) return { kind: "signed-out" };
  if (managesCourse(person, course)) {
    return { kind: "allowed", via: "manage" };
  }
  if (!isEnrolled(db, person.id, course.id)) return { kind: "not-enrolled" };

  const purchaseCountry = regionLockedBy(db, person, course, viewer.country);
  if (purchaseCountry && viewer.country) {
    return {
      kind: "region-locked",
      purchaseCountry,
      currentCountry: viewer.country,
    };
  }
  return { kind: "allowed", via: "enrollment" };
}

export function canManage(db: Db, viewer: Viewer, courseId: number) {
  const person = getPerson(db, viewer);
  const course = getCourse(db, courseId);
  return !!person && !!course && managesCourse(person, course);
}

export type Person = {
  userId: number;
  isInstructor: boolean;
  isPlatformAdmin: boolean;
};

export function findPerson(db: Db, viewer: Viewer): Person | null {
  const person = getPerson(db, viewer);
  if (!person) return null;
  return {
    userId: person.id,
    isInstructor: person.role === UserRole.Instructor,
    isPlatformAdmin: person.role === UserRole.Admin,
  };
}
