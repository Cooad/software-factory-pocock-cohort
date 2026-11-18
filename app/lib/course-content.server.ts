import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import { lessons, modules } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function createModule(db: Db, courseId: number, title: string) {
  const last = db
    .select({ max: sql<number>`coalesce(max(${modules.position}), 0)` })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .get();

  return db
    .insert(modules)
    .values({ courseId, title, position: (last?.max ?? 0) + 1 })
    .returning()
    .get();
}

export function createLesson(db: Db, moduleId: number, title: string) {
  const last = db
    .select({ max: sql<number>`coalesce(max(${lessons.position}), 0)` })
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId))
    .get();

  return db
    .insert(lessons)
    .values({
      moduleId,
      title,
      content: null,
      videoUrl: null,
      position: (last?.max ?? 0) + 1,
      durationMinutes: null,
    })
    .returning()
    .get();
}
