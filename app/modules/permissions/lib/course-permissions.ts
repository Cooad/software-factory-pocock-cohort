import { data } from "react-router";
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
import {
  coupons,
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
} from "~/db/schema";
import { checkCountryLock, countryName } from "~/lib/ppp";
import { getPerson, SIGNED_OUT_MESSAGE, type Db, type Person } from "./person";

export type Capability = "view" | "take" | "manage";

/**
 * A raw id: a number, or the string straight from route params. Anything that
 * isn't a positive integer counts as not found.
 */
export type Id = number | string;

/**
 * Names a course by id, by slug, or through one of its lessons. It may also
 * carry a lesson or module id, which must belong to that course.
 */
export type CourseRef = (
  | { courseId: Id; slug?: never }
  | { slug: string; courseId?: never }
  | { lessonId: Id; courseId?: never; slug?: never }
) & { lessonId?: Id; moduleId?: Id };

/** Why a Person may not do something on a course. */
export type DenialReason =
  | { kind: "signed-out" }
  | { kind: "not-enrolled" }
  /** A Purchase made at a Purchasing-Power Price, used from another country. */
  | { kind: "country-lock"; purchaseCountry: string; currentCountry: string }
  | { kind: "not-owning-instructor-or-platform-admin" };

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: DenialReason };

export type Course = typeof courses.$inferSelect;

export type CourseDecisions =
  | { found: false }
  | {
      found: true;
      course: Course;
      person: Person | null;
      /** Has an Enrollment, even one under Country Lock. */
      enrolled: boolean;
      view: Decision;
      take: Decision;
      manage: Decision;
    };

const ALLOWED: Decision = { allowed: true };

function deny(reason: DenialReason): Decision {
  return { allowed: false, reason };
}

export function decide(
  db: Db,
  person: Person | null,
  ref: CourseRef
): CourseDecisions {
  const course = findCourse(db, ref);
  if (!course) return { found: false };

  if (!person) {
    const signedOut = deny({ kind: "signed-out" });
    return {
      found: true,
      course,
      person,
      enrolled: false,
      view: signedOut,
      take: signedOut,
      manage: signedOut,
    };
  }

  const canManage = mayManage(person, course);
  const enrolled = !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, person.id),
        eq(enrollments.courseId, course.id)
      )
    )
    .get();

  // The owning Instructor and Platform Admins are exempt from Country Lock.
  const countryLock =
    enrolled && !canManage ? findCountryLock(db, person, course) : null;

  const take = !enrolled
    ? deny({ kind: "not-enrolled" })
    : countryLock
      ? deny(countryLock)
      : ALLOWED;

  return {
    found: true,
    course,
    person,
    enrolled,
    view: canManage ? ALLOWED : take,
    take,
    manage: canManage
      ? ALLOWED
      : deny({ kind: "not-owning-instructor-or-platform-admin" }),
  };
}

/** Every decision for the request's Person (or nobody). Never throws. */
export async function getCourseDecisions(
  db: Db,
  request: Request,
  ref: CourseRef
): Promise<CourseDecisions> {
  return decide(db, await getPerson(db, request), ref);
}

/**
 * Throws 404 when the course isn't found, then 401 when signed out, then 403
 * when the Person lacks the capability. Returns the Person and the course.
 */
export async function requireCapability(
  db: Db,
  request: Request,
  capability: Capability,
  ref: CourseRef
): Promise<{ person: Person; course: Course }> {
  const decisions = await getCourseDecisions(db, request, ref);
  if (!decisions.found) throw data("Course not found.", { status: 404 });

  const { person, course } = decisions;
  if (!person) throw data(SIGNED_OUT_MESSAGE, { status: 401 });

  const decision = decisions[capability];
  if (!decision.allowed) {
    throw data(refusalMessage(decision.reason), { status: 403 });
  }
  return { person, course };
}

function refusalMessage(reason: DenialReason): string {
  switch (reason.kind) {
    case "signed-out":
      return SIGNED_OUT_MESSAGE;
    case "not-enrolled":
      return "You must be enrolled in this course.";
    case "country-lock":
      return `This course was bought in ${countryName(reason.purchaseCountry)}, so it can't be used from ${countryName(reason.currentCountry)}.`;
    case "not-owning-instructor-or-platform-admin":
      return "Only this course's Instructor or a Platform Admin can do that.";
  }
}

type CountryLock = Extract<DenialReason, { kind: "country-lock" }>;

/** The course facts a Country Lock is judged on. */
export type PricedCourse = Pick<
  Course,
  "id" | "price" | "pppEnabled" | "instructorId"
>;

/** Owning the course is what counts, whatever the role column says. */
function mayManage(person: Person, course: PricedCourse): boolean {
  return course.instructorId === person.id || person.role === "platform-admin";
}

/**
 * The country of the buyer's newest Individual Purchase of each course. A
 * Team Licence is a Purchase that granted Seats, so it is skipped.
 */
function newestIndividualPurchaseCountries(
  db: Db,
  buyerId: number,
  courseIds: number[]
): Map<number, string | null> {
  const newestFirst = db
    .select({ courseId: purchases.courseId, country: purchases.country })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, buyerId),
        inArray(purchases.courseId, courseIds),
        notExists(
          db
            .select({ id: coupons.id })
            .from(coupons)
            .where(eq(coupons.purchaseId, purchases.id))
        )
      )
    )
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .all();

  const countries = new Map<number, string | null>();
  for (const { courseId, country } of newestFirst) {
    if (!countries.has(courseId)) countries.set(courseId, country);
  }
  return countries;
}

function lockFor(
  course: PricedCourse,
  purchaseCountry: string | null,
  person: Person
): CountryLock | null {
  const lock = checkCountryLock(
    course.price,
    course.pppEnabled,
    purchaseCountry,
    person.country
  );
  if (!lock.blocked || !lock.purchaseCountry || !lock.blockedCountry) {
    return null;
  }
  return {
    kind: "country-lock",
    purchaseCountry: lock.purchaseCountry,
    currentCountry: lock.blockedCountry,
  };
}

/**
 * Playback Country Lock: judged against the newest Individual Purchase only.
 * A Team Licence or a Claimed Seat never locks playback (ADR-0013).
 */
function findCountryLock(
  db: Db,
  person: Person,
  course: Course
): CountryLock | null {
  const countries = newestIndividualPurchaseCountries(db, person.id, [
    course.id,
  ]);
  return lockFor(course, countries.get(course.id) ?? null, person);
}

/**
 * Of these courses, the ids of those the Person has an Enrollment on but
 * may not take because of Country Lock. Two queries, however many courses.
 */
export function findCountryLockedCourseIds(
  db: Db,
  person: Person,
  candidates: PricedCourse[]
): Set<number> {
  const lockable = candidates.filter((course) => !mayManage(person, course));
  if (lockable.length === 0) return new Set();
  const courseIds = lockable.map((course) => course.id);

  const enrolled = db
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, person.id),
        inArray(enrollments.courseId, courseIds)
      )
    )
    .all();
  const enrolledIds = new Set(enrolled.map((row) => row.courseId));
  const countries = newestIndividualPurchaseCountries(db, person.id, courseIds);

  return new Set(
    lockable
      .filter((course) => enrolledIds.has(course.id))
      .filter((course) =>
        lockFor(course, countries.get(course.id) ?? null, person)
      )
      .map((course) => course.id)
  );
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function parseId(id: Id): number | null {
  const parsed =
    typeof id === "number" ? id : POSITIVE_INTEGER.test(id) ? Number(id) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function courseIdOfModule(db: Db, moduleId: number): number | null {
  const mod = db
    .select({ courseId: modules.courseId })
    .from(modules)
    .where(eq(modules.id, moduleId))
    .get();
  return mod?.courseId ?? null;
}

function courseIdOfLesson(db: Db, lessonId: number): number | null {
  const lesson = db
    .select({ moduleId: lessons.moduleId })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
  return lesson ? courseIdOfModule(db, lesson.moduleId) : null;
}

/**
 * The course id an optional lesson or module id belongs to: `undefined` when
 * none was given, null when it's malformed or doesn't exist.
 */
function owningCourseId(
  id: Id | undefined,
  lookUp: (id: number) => number | null
): number | null | undefined {
  if (id === undefined) return undefined;
  const parsed = parseId(id);
  return parsed === null ? null : lookUp(parsed);
}

/**
 * The course the reference names, or null when it doesn't exist, an id is
 * malformed, or a lesson or module named alongside it is in another course.
 */
function findCourse(db: Db, ref: CourseRef): Course | null {
  const lessonCourseId = owningCourseId(ref.lessonId, (id) =>
    courseIdOfLesson(db, id)
  );
  const moduleCourseId = owningCourseId(ref.moduleId, (id) =>
    courseIdOfModule(db, id)
  );
  if (lessonCourseId === null || moduleCourseId === null) return null;

  let course: Course | undefined;
  if (ref.slug !== undefined) {
    course = db.select().from(courses).where(eq(courses.slug, ref.slug)).get();
  } else {
    const courseId =
      ref.courseId !== undefined ? parseId(ref.courseId) : lessonCourseId;
    if (courseId == null) return null;
    course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  }
  if (!course) return null;

  if (lessonCourseId !== undefined && lessonCourseId !== course.id) return null;
  if (moduleCourseId !== undefined && moduleCourseId !== course.id) return null;
  return course;
}
