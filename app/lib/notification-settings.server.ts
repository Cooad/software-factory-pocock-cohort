import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type * as schema from "~/db/schema";
import { coupons, courses, purchases, UserRole, users } from "~/db/schema";
import type { Notifier } from "~/lib/notifications.server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
} from "~/lib/notification-preferences";

type Db = BetterSQLite3Database<typeof schema>;

// ─── Notification settings ───
// The `/settings` Notifications card: which switches a person sees, their
// current values, and saving one switch. Takes the `Notifier` port so tests
// hand in the fake.

/**
 * Saves one switch (the `feed` channel of one category) by merging it into the
 * stored set. The vendor's write replaces the whole set, so the other
 * categories are read first and written back unchanged.
 */
export async function savePreference(
  notifier: Notifier,
  userId: number,
  category: PreferenceCategory,
  enabled: boolean
): Promise<void> {
  const stored =
    (await notifier.getPreferences(userId)) ?? DEFAULT_NOTIFICATION_PREFERENCES;
  await notifier.setPreferences(userId, {
    ...stored,
    [category]: { ...stored[category], feed: enabled },
  });
}

export type NotificationSetting = {
  category: PreferenceCategory;
  enabled: boolean;
};

/**
 * The switches this person sees on the Notifications card, with their current
 * values (the stored set, or the defaults when there is none).
 */
export async function getNotificationSettings(
  db: Db,
  notifier: Notifier,
  userId: number
): Promise<NotificationSetting[]> {
  const visible = visibleCategories(db, userId);
  const stored =
    (await notifier.getPreferences(userId)) ?? DEFAULT_NOTIFICATION_PREFERENCES;
  return visible.map((category) => ({
    category,
    enabled: stored[category].feed,
  }));
}

/**
 * Which switches apply depends on what the person is or has, not their role.
 * A hidden switch keeps its default.
 */
function visibleCategories(db: Db, userId: number): PreferenceCategory[] {
  const hasPurchase = !!db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();
  // A Team Licence is the Purchase that granted Seats (there's no kind column).
  const isTeamAdmin = !!db
    .select({ id: coupons.id })
    .from(coupons)
    .innerJoin(purchases, eq(purchases.id, coupons.purchaseId))
    .where(eq(purchases.userId, userId))
    .get();
  const ownsCourse = !!db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, userId))
    .get();
  const isPlatformAdmin =
    db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .get()?.role === UserRole.Admin;

  const visible: Record<PreferenceCategory, boolean> = {
    "refund-request-updates": hasPurchase,
    "open-refund-requests": isPlatformAdmin,
    "seat-claims": isTeamAdmin,
    enrollments: ownsCourse,
    "discussion-questions": ownsCourse,
    "discussion-replies": true,
  };
  return PREFERENCE_CATEGORIES.filter((category) => visible[category]);
}
