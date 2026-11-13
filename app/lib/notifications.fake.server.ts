import type { NotificationPreferences } from "~/lib/notification-preferences";
import type {
  NotificationPerson,
  NotificationTrigger,
  Notifier,
} from "~/lib/notifications.server";

// ─── Notifications: in-memory fake adapter (tests only) ───
// Records every trigger, every identified user and every preference write, and
// keeps preference sets in memory. Call `failWith(error)` to make every call
// throw, to check that domain actions survive a vendor outage.

export type FakeNotifier = Notifier & {
  triggers: NotificationTrigger[];
  identifiedUsers: NotificationPerson[];
  preferenceWrites: { userId: number; preferences: NotificationPreferences }[];
  failWith(error: Error | null): void;
};

export function createFakeNotifier(): FakeNotifier {
  let failure: Error | null = null;
  const triggers: NotificationTrigger[] = [];
  const identifiedUsers: NotificationPerson[] = [];
  const preferenceWrites: FakeNotifier["preferenceWrites"] = [];
  const preferencesByUser = new Map<number, NotificationPreferences>();

  return {
    triggers,
    identifiedUsers,
    preferenceWrites,
    failWith(error) {
      failure = error;
    },
    async trigger(notification) {
      if (failure) throw failure;
      triggers.push(notification);
    },
    async feedCredentials(userId) {
      if (failure) throw failure;
      return {
        userId: String(userId),
        userToken: `fake-token-for-${userId}`,
        publicApiKey: "fake-public-key",
        feedChannelId: "fake-feed",
      };
    },
    async identifyUser(person) {
      if (failure) throw failure;
      identifiedUsers.push({ ...person });
    },
    async getPreferences(userId) {
      if (failure) throw failure;
      const stored = preferencesByUser.get(userId);
      return stored ? structuredClone(stored) : null;
    },
    async setPreferences(userId, preferences) {
      if (failure) throw failure;
      preferenceWrites.push({ userId, preferences: structuredClone(preferences) });
      preferencesByUser.set(userId, structuredClone(preferences));
    },
  };
}
