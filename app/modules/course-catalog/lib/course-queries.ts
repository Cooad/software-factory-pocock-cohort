import { eq, like, and, or, sql, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  courses as coursesTable,
  categories as categoriesTable,
  users,
  modules,
  lessons,
  enrollments as enrollmentsTable,
  lessonProgress,
  courseRatings,
  CourseStatus,
  LessonProgressStatus,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type CourseFilter = {
  search: string | null;
  category: string | null;
  /** Only these courses; null for every course. */
  onlyCourseIds: number[] | null;
};

const PAGE_SIZE = 50;

function courseConditions(filter: CourseFilter) {
  const conditions = [eq(coursesTable.status, CourseStatus.Published)];

  if (filter.onlyCourseIds) {
    conditions.push(inArray(coursesTable.id, filter.onlyCourseIds));
  }

  if (filter.search) {
    const term = `%${filter.search}%`;
    const matches = or(
      like(coursesTable.title, term),
      like(coursesTable.description, term)
    );
    if (matches) conditions.push(matches);
  }

  if (filter.category) {
    conditions.push(eq(categoriesTable.slug, filter.category));
  }

  return conditions;
}

/** Published courses matching the filter, newest first, at most 50. */
export function buildCourseQuery(db: Db, filter: CourseFilter) {
  return db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      slug: coursesTable.slug,
      description: coursesTable.description,
      salesCopy: coursesTable.salesCopy,
      instructorId: coursesTable.instructorId,
      categoryId: coursesTable.categoryId,
      status: coursesTable.status,
      coverImageUrl: coursesTable.coverImageUrl,
      price: coursesTable.price,
      pppEnabled: coursesTable.pppEnabled,
      createdAt: coursesTable.createdAt,
      updatedAt: coursesTable.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      categoryName: categoriesTable.name,
    })
    .from(coursesTable)
    .innerJoin(users, eq(coursesTable.instructorId, users.id))
    .innerJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id))
    .where(and(...courseConditions(filter)))
    .orderBy(sql`${coursesTable.createdAt} DESC`)
    .limit(PAGE_SIZE)
    .all();
}

export function getLessonCountForCourse(db: Db, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return 0;

  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .get();

  return count?.count ?? 0;
}

export function getAllCategories(db: Db) {
  return db.select().from(categoriesTable).orderBy(categoriesTable.name).all();
}

export function getUserEnrolledCourses(db: Db, userId: number) {
  return db
    .select({
      enrollmentId: enrollmentsTable.id,
      courseId: enrollmentsTable.courseId,
      enrolledAt: enrollmentsTable.enrolledAt,
      completedAt: enrollmentsTable.completedAt,
      courseTitle: coursesTable.title,
      courseSlug: coursesTable.slug,
      courseDescription: coursesTable.description,
      coverImageUrl: coursesTable.coverImageUrl,
    })
    .from(enrollmentsTable)
    .innerJoin(coursesTable, eq(enrollmentsTable.courseId, coursesTable.id))
    .where(eq(enrollmentsTable.userId, userId))
    .all();
}

export function getCourseLessonIds(db: Db, courseId: number): number[] {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .all();

  return courseLessons.map((l) => l.id);
}

function getCompletedLessonCount(db: Db, userId: number, lessonIds: number[]) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))
      )
    )
    .get();

  return result?.count ?? 0;
}

/** The Student's completed lessons and percentage, by lesson count. */
export function getProgress(db: Db, userId: number, courseId: number) {
  const lessonIds = getCourseLessonIds(db, courseId);
  if (lessonIds.length === 0) return { progress: 0, completedLessons: 0 };

  const completedLessons = getCompletedLessonCount(db, userId, lessonIds);
  return {
    progress: Math.round((completedLessons / lessonIds.length) * 100),
    completedLessons,
  };
}

type CourseRatingSummary = {
  average: number | null;
  count: number;
};

const EMPTY_SUMMARY: CourseRatingSummary = { average: null, count: 0 };

export function getCourseRatingSummaries(
  db: Db,
  courseIds: number[]
): Map<number, CourseRatingSummary> {
  const summaries = new Map<number, CourseRatingSummary>();

  if (courseIds.length === 0) return summaries;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    summaries.set(row.courseId, {
      average: row.average === null ? null : Math.round(row.average * 10) / 10,
      count: row.count,
    });
  }

  for (const courseId of courseIds) {
    if (!summaries.has(courseId)) {
      summaries.set(courseId, EMPTY_SUMMARY);
    }
  }

  return summaries;
}
