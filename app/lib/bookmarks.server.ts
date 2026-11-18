import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

function findBookmark(db: Db, studentId: number, lessonId: number) {
  return db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, studentId), eq(bookmarks.lessonId, lessonId))
    )
    .get();
}

export function isBookmarked(db: Db, studentId: number, lessonId: number) {
  return !!findBookmark(db, studentId, lessonId);
}

export function toggleBookmark(
  db: Db,
  studentId: number,
  lessonId: number,
  now: Date
): boolean {
  const existing = findBookmark(db, studentId, lessonId);

  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return false;
  }

  db.insert(bookmarks)
    .values({ userId: studentId, lessonId, createdAt: now.toISOString() })
    .onConflictDoNothing()
    .run();
  return true;
}

export function listBookmarks(db: Db, studentId: number) {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, studentId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}
