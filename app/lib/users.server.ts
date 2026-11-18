import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export function createStudent(db: Db, name: string, email: string) {
  return db
    .insert(users)
    .values({ name, email, role: UserRole.Student, avatarUrl: null })
    .returning()
    .get();
}
