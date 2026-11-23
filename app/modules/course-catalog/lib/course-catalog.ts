import { calculatePppPrice } from "~/lib/ppp";
import { createCoursePermissions } from "~/modules/permissions/course-permissions.server";
import type { Person } from "~/modules/permissions/person.server";
import {
  buildCourseQuery,
  getAllCategories,
  getCourseRatingSummaries,
  getLessonCountForCourse,
  getProgress,
  getUserEnrolledCourses,
  type Db,
} from "./course-queries";

/**
 * What the card says about the viewer's relationship to the course:
 * - your-course: the viewer is its Instructor (wins over everything else).
 * - enrolled: the viewer has an Enrollment.
 * - locked: the viewer has an Enrollment under Country Lock.
 */
export type CatalogBadge = "your-course" | "enrolled" | "locked" | null;

export type CatalogQuery = {
  search: string | null;
  category: string | null;
  /** Only courses the viewer has an Enrollment on. Ignored when signed out. */
  owned: boolean;
};

export type CatalogViewer = {
  person: Person | null;
  /** The request's country, for Purchasing-Power Prices. */
  country: string | null;
};

type Progress = { progress: number; completedLessons: number };

/** The course ids the Person has an Enrollment on, without duplicates. */
function enrolledCourseIds(db: Db, person: Person | null): Set<number> {
  if (!person) return new Set();
  return new Set(
    getUserEnrolledCourses(db, person.id).map(
      (enrollment) => enrollment.courseId
    )
  );
}

function progressByCourse(
  db: Db,
  person: Person | null,
  courseIds: Set<number>
): Map<number, Progress> {
  const progress = new Map<number, Progress>();
  if (!person) return progress;
  for (const courseId of courseIds) {
    progress.set(courseId, getProgress(db, person.id, courseId));
  }
  return progress;
}

function badgeFor(
  permissions: ReturnType<typeof createCoursePermissions>,
  person: Person | null,
  course: { id: number; instructorId: number; enrolled: boolean }
): CatalogBadge {
  if (!person) return null;
  if (course.instructorId === person.id) return "your-course";
  if (!course.enrolled) return null;
  const decisions = permissions.decide(person, { courseId: course.id });
  const locked =
    decisions.found &&
    !decisions.take.allowed &&
    decisions.take.reason.kind === "country-lock";
  return locked ? "locked" : "enrolled";
}

export function browseCatalog(
  db: Db,
  viewer: CatalogViewer,
  query: CatalogQuery
) {
  const { person, country } = viewer;
  const permissions = createCoursePermissions(db);
  const enrolledIds = enrolledCourseIds(db, person);
  const owned = query.owned && person !== null;

  const courses = buildCourseQuery(db, {
    search: query.search,
    category: query.category,
    onlyCourseIds: owned ? [...enrolledIds] : null,
  });

  const progressMap = progressByCourse(db, person, enrolledIds);
  const ratingSummaries = getCourseRatingSummaries(
    db,
    courses.map((c) => c.id)
  );

  return {
    courses: courses.map((course) => {
      const userProgress = progressMap.get(course.id);
      const rating = ratingSummaries.get(course.id);
      return {
        ...course,
        lessonCount: getLessonCountForCourse(db, course.id),
        progress: userProgress?.progress ?? null,
        completedLessons: userProgress?.completedLessons ?? null,
        pppPrice: pppPriceFor(course, country),
        ratingAverage: rating?.average ?? null,
        ratingCount: rating?.count ?? 0,
        badge: badgeFor(permissions, person, {
          ...course,
          enrolled: enrolledIds.has(course.id),
        }),
      };
    }),
    categories: getAllCategories(db),
  };
}

function pppPriceFor(
  course: { price: number; pppEnabled: boolean },
  country: string | null
) {
  return course.pppEnabled
    ? calculatePppPrice(course.price, country)
    : course.price;
}

export type CatalogCourse = ReturnType<typeof browseCatalog>["courses"][number];
