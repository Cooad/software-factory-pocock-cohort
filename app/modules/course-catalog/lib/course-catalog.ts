import { calculatePppPrice } from "~/lib/ppp";
import { createCoursePermissions } from "~/modules/permissions/course-permissions.server";
import type { Person } from "~/modules/permissions/person.server";
import {
  findPublishedCourses,
  getAllCategories,
  getCompletedLessonCounts,
  getCourseRatingSummaries,
  getLessonCounts,
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

type Progress = { progress: number | null; completedLessons: number | null };

const NO_PROGRESS: Progress = { progress: null, completedLessons: null };

/** The course ids the Person has an Enrollment on, without duplicates. */
function enrolledCourseIds(db: Db, person: Person | null): Set<number> {
  if (!person) return new Set();
  return new Set(
    getUserEnrolledCourses(db, person.id).map(
      (enrollment) => enrollment.courseId
    )
  );
}

/** Progress on each course with an Enrollment, from its lesson counts. */
function progressOn(
  enrolledIds: Set<number>,
  lessonCounts: Map<number, number>,
  completedCounts: Map<number, number>
): (courseId: number) => Progress {
  return (courseId) => {
    if (!enrolledIds.has(courseId)) return NO_PROGRESS;
    const lessonCount = lessonCounts.get(courseId) ?? 0;
    const completedLessons = completedCounts.get(courseId) ?? 0;
    const progress =
      lessonCount === 0
        ? 0
        : Math.round((completedLessons / lessonCount) * 100);
    return { progress, completedLessons };
  };
}

function badgeFor(
  person: Person | null,
  course: { id: number; instructorId: number },
  ids: { enrolled: Set<number>; locked: Set<number> }
): CatalogBadge {
  if (!person) return null;
  if (course.instructorId === person.id) return "your-course";
  if (!ids.enrolled.has(course.id)) return null;
  return ids.locked.has(course.id) ? "locked" : "enrolled";
}

export function browseCatalog(
  db: Db,
  viewer: CatalogViewer,
  query: CatalogQuery
) {
  const { person, country } = viewer;
  const enrolledIds = enrolledCourseIds(db, person);
  const owned = query.owned && person !== null;

  const courses = findPublishedCourses(db, {
    search: query.search,
    category: query.category,
    onlyCourseIds: owned ? [...enrolledIds] : null,
  });

  const courseIds = courses.map((c) => c.id);
  const lessonCounts = getLessonCounts(db, courseIds);
  const completedCounts = person
    ? getCompletedLessonCounts(db, person.id, [...enrolledIds])
    : new Map<number, number>();
  const progressFor = progressOn(enrolledIds, lessonCounts, completedCounts);
  const ratingSummaries = getCourseRatingSummaries(db, courseIds);
  const badgeIds = {
    enrolled: enrolledIds,
    locked: person
      ? createCoursePermissions(db).findCountryLockedCourseIds(person, courses)
      : new Set<number>(),
  };

  return {
    courses: courses.map((course) => {
      const rating = ratingSummaries.get(course.id);
      return {
        ...course,
        lessonCount: lessonCounts.get(course.id) ?? 0,
        ...progressFor(course.id),
        pppPrice: pppPriceFor(course, country),
        ratingAverage: rating?.average ?? null,
        ratingCount: rating?.count ?? 0,
        badge: badgeFor(person, course, badgeIds),
      };
    }),
    categories: getAllCategories(db),
    owned,
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
