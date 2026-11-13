import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import {
  syncUserSafely,
  type NotificationPerson,
  type Notifier,
} from "~/lib/notifications.server";

// ─── Users ───
// Creating and editing Cadence users. Every write that changes what Knock
// knows about a user (name, email, avatar) syncs them through the
// `Notifier` port afterwards; a sync failure is logged and never fails the
// write. Role is never synced.
//
// Database first, `Notifier` second (project convention for services that
// send to the Notifications port). Positional parameters.

export type Db = BetterSQLite3Database<typeof schema>;

export type User = typeof users.$inferSelect;

function toPerson(user: User): NotificationPerson {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

function getUserByEmail(db: Db, email: string) {
  return db.select().from(users).where(eq(users.email, email)).get();
}

/**
 * Signs someone up as a Student and syncs them. An email that already has an
 * account returns that user (`created: false`) and changes nothing.
 */
export async function signUp(
  db: Db,
  notifier: Notifier,
  name: string,
  email: string
): Promise<{ user: User; created: boolean }> {
  const existing = getUserByEmail(db, email);
  if (existing) return { user: existing, created: false };

  const user = db
    .insert(users)
    .values({ name, email, role: UserRole.Student, avatarUrl: null })
    .returning()
    .get();
  await syncUserSafely(notifier, toPerson(user));
  return { user, created: true };
}

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error("User not found.");
  return user;
}

/**
 * Saves a person's own profile from `/settings`. A name change syncs them, so
 * their Notifications show the new name; a bio isn't synced.
 */
export async function updateOwnProfile(
  db: Db,
  notifier: Notifier,
  userId: number,
  name: string,
  bio: string | null
): Promise<User> {
  const before = getUser(db, userId);
  const updated = db
    .update(users)
    .set({ name, bio })
    .where(eq(users.id, userId))
    .returning()
    .get();
  if (updated.name !== before.name) {
    await syncUserSafely(notifier, toPerson(updated));
  }
  return updated;
}

/** A Platform Admin's edit of a user's name and email on `/admin/users`. */
export async function adminUpdateUser(
  db: Db,
  notifier: Notifier,
  userId: number,
  name: string,
  email: string
): Promise<User> {
  getUser(db, userId);
  const updated = db
    .update(users)
    .set({ name, email })
    .where(eq(users.id, userId))
    .returning()
    .get();
  await syncUserSafely(notifier, toPerson(updated));
  return updated;
}

/**
 * Syncs every user, one at a time. Used by the seed and the one-off backfill
 * script; safe to run again, because existing preferences are kept.
 */
export async function syncAllUsers(
  db: Db,
  notifier: Notifier
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  for (const user of db.select().from(users).orderBy(users.id).all()) {
    if (await syncUserSafely(notifier, toPerson(user))) synced++;
    else failed++;
  }
  return { synced, failed };
}
