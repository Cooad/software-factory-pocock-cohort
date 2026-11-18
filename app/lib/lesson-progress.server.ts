import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { lessonProgress, LessonProgressStatus } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function getLessonProgress(db: Db, studentId: number, lessonId: number) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, studentId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

export function markLessonComplete(
  db: Db,
  studentId: number,
  lessonId: number,
  now: Date
) {
  const existing = getLessonProgress(db, studentId, lessonId);

  if (existing) {
    return db
      .update(lessonProgress)
      .set({
        status: LessonProgressStatus.Completed,
        completedAt: now.toISOString(),
      })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId: studentId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt: now.toISOString(),
    })
    .returning()
    .get();
}

export function markLessonInProgress(
  db: Db,
  studentId: number,
  lessonId: number
) {
  const existing = getLessonProgress(db, studentId, lessonId);

  if (existing) {
    if (existing.status === LessonProgressStatus.Completed) {
      return existing;
    }
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId: studentId,
      lessonId,
      status: LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}
