import {
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences,
} from "~/lib/notification-preferences";
import type {
  Notification,
  NotificationPerson,
  Notifications,
} from "~/lib/notifications.server";

// Preference writes merge in, like the Knock adapter's. `failWith(error)`
// makes every later call throw, to test that services tolerate a failing port.

export type SentNotification = Notification & { idempotencyKey: string };

export type FakeNotifications = Notifications & {
  sent: SentNotification[];
  users: Map<number, NotificationPerson>;
  preferences: Map<number, NotificationPreferences>;
  feedOf(userId: number): SentNotification[];
  failWith(error: Error): void;
};

export function fakeNotifications(): FakeNotifications {
  let failure: Error | null = null;
  const sent: SentNotification[] = [];
  const users = new Map<number, NotificationPerson>();
  const preferences = new Map<number, NotificationPreferences>();
  const archived = new Set<SentNotification>();

  return {
    sent,
    users,
    preferences,
    feedOf(userId) {
      return sent.filter((n) => n.recipient.id === userId && !archived.has(n));
    },
    failWith(error) {
      failure = error;
    },
    async send(notification, idempotencyKey) {
      if (failure) throw failure;
      sent.push({ ...notification, idempotencyKey });
    },
    async feedCredentials() {
      if (failure) throw failure;
      return null;
    },
    async identifyUser(person) {
      if (failure) throw failure;
      users.set(person.id, { ...person });
    },
    async getPreferences(userId) {
      if (failure) throw failure;
      const stored = preferences.get(userId);
      return stored ? structuredClone(stored) : null;
    },
    async mergePreferences(userId, changes) {
      if (failure) throw failure;
      const merged = structuredClone(preferences.get(userId) ?? {});
      for (const category of NOTIFICATION_CATEGORIES) {
        const channels = changes[category];
        if (channels) merged[category] = { ...merged[category], ...channels };
      }
      preferences.set(userId, merged);
    },
    async archiveForComment(commentId) {
      if (failure) throw failure;
      for (const n of sent) {
        if ("commentId" in n.data && n.data.commentId === commentId) {
          archived.add(n);
        }
      }
    },
  };
}
