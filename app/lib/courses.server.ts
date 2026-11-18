import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { courses, CourseStatus } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function createCourse(
  db: Db,
  title: string,
  slug: string,
  description: string,
  salesCopy: string,
  instructorId: number,
  categoryId: number,
  coverImageUrl: string | null
) {
  if (salesCopy.trim().length === 0) {
    throw new Error("Sales copy cannot be empty");
  }

  return db
    .insert(courses)
    .values({
      title,
      slug,
      description,
      salesCopy,
      instructorId,
      categoryId,
      status: CourseStatus.Draft,
      coverImageUrl,
    })
    .returning()
    .get();
}

export function setCourseStatus(
  db: Db,
  courseId: number,
  status: CourseStatus,
  now: Date
) {
  return db
    .update(courses)
    .set({ status, updatedAt: now.toISOString() })
    .where(eq(courses.id, courseId))
    .returning()
    .get();
}
