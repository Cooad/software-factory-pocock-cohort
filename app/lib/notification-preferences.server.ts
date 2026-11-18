import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { coupons, courses, purchases, UserRole, users } from "~/db/schema";
import {
  DEFAULT_FEED_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  type FeedPreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from "~/lib/notification-preferences";
import {
  NOTIFICATION_PERSON_COLUMNS,
  tolerateNotificationFailure,
  type NotificationPerson,
  type Notifications,
} from "~/lib/notifications.server";

function defaultPreferences(): NotificationPreferences {
  const set: NotificationPreferences = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    set[category] = { feed: DEFAULT_FEED_PREFERENCES[category] };
  }
  return set;
}

function hasNoPreferences(stored: NotificationPreferences | null) {
  return !stored || Object.keys(stored).length === 0;
}

/**
 * Never throws: a failure is logged, so signup, settings and seeding still
 * succeed.
 */
export async function syncUser(
  notifications: Notifications,
  person: NotificationPerson
): Promise<void> {
  await tolerateNotificationFailure(
    `Could not sync user ${person.id}`,
    undefined,
    async () => {
      await notifications.identifyUser(person);
      const existing = await notifications.getPreferences(person.id);
      if (hasNoPreferences(existing)) {
        await notifications.mergePreferences(person.id, defaultPreferences());
      }
    }
  );
}

/** A failure for one user is logged and the rest still sync. */
export async function syncAllUsers(
  db: Db,
  notifications: Notifications
): Promise<number> {
  const everyone = db.select(NOTIFICATION_PERSON_COLUMNS).from(users).all();
  for (const person of everyone) {
    await syncUser(notifications, person);
  }
  return everyone.length;
}

export async function getFeedPreferences(
  notifications: Notifications,
  userId: number
): Promise<FeedPreferences> {
  const stored = await notifications.getPreferences(userId);
  const feedPreferences = { ...DEFAULT_FEED_PREFERENCES };
  for (const category of NOTIFICATION_CATEGORIES) {
    const feed = stored?.[category]?.feed;
    if (feed !== undefined) feedPreferences[category] = feed;
  }
  return feedPreferences;
}

/**
 * A person with no set yet gets the defaults written with the change. Throws
 * when the port fails, so the caller can tell the person.
 */
export async function setFeedPreference(
  notifications: Notifications,
  userId: number,
  category: NotificationCategory,
  enabled: boolean
): Promise<void> {
  const existing = await notifications.getPreferences(userId);
  const base = hasNoPreferences(existing) ? defaultPreferences() : {};
  await notifications.mergePreferences(userId, {
    ...base,
    [category]: { feed: enabled },
  });
}

type Db = BetterSQLite3Database<typeof schema>;

/** In display order. Hidden categories keep their default. */
export function visibleNotificationCategories(
  db: Db,
  userId: number
): NotificationCategory[] {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return [];

  const hasPurchase = !!db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();
  const isTeamAdmin = !!db
    .select({ id: coupons.id })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .where(eq(purchases.userId, userId))
    .get();
  const ownsCourse = !!db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, userId))
    .get();
  const isPlatformAdmin = user.role === UserRole.Admin;

  const shown: Record<NotificationCategory, boolean> = {
    refundRequestUpdates: hasPurchase,
    seatClaims: isTeamAdmin,
    enrollments: ownsCourse,
    discussionQuestions: ownsCourse,
    openRefundRequests: isPlatformAdmin,
    discussionReplies: true,
  };
  return NOTIFICATION_CATEGORIES.filter((category) => shown[category]);
}
