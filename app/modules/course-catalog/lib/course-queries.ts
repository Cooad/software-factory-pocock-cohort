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
export function findPublishedCourses(db: Db, filter: CourseFilter) {
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

/** How many lessons each course has, keyed by course id. */
export function getLessonCounts(
  db: Db,
  courseIds: number[]
): Map<number, number> {
  if (courseIds.length === 0) return new Map();
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
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

/** How many lessons the Student has completed in each course, keyed by course id. */
export function getCompletedLessonCounts(
  db: Db,
  userId: number,
  courseIds: number[]
): Map<number, number> {
  if (courseIds.length === 0) return new Map();
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(modules.courseId, courseIds)
      )
    )
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
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
