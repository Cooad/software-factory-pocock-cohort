import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { videoWatchEvents } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function recordVideoWatchEvent(
  db: Db,
  studentId: number,
  lessonId: number,
  eventType: string,
  positionSeconds: number
) {
  return db
    .insert(videoWatchEvents)
    .values({ userId: studentId, lessonId, eventType, positionSeconds })
    .returning()
    .get();
}
