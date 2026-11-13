import type { NotificationPreferences } from "~/lib/notification-preferences";
import type {
  NotificationPerson,
  NotificationTrigger,
  Notifier,
} from "~/lib/notifications.server";

// ─── Notifications: in-memory fake adapter (tests only) ───
// Records every trigger, every identified user and every preference write, and
// keeps preference sets in memory. Call `failWith(error)` to make every call
// throw, to check that domain actions survive a vendor outage. `feed(userId)`
// is what that user's feed would show: their triggers, minus archived ones.

export type FakeNotifier = Notifier & {
  triggers: NotificationTrigger[];
  /** Comment ids passed to `archiveCausedByComment`. */
  archivedCommentIds: number[];
  identifiedUsers: NotificationPerson[];
  preferenceWrites: { userId: number; preferences: NotificationPreferences }[];
  feed(userId: number): NotificationTrigger[];
  failWith(error: Error | null): void;
};

function causedByComment(notification: NotificationTrigger, commentId: number) {
  const data: object = notification.data;
  return "commentId" in data && data.commentId === commentId;
}

export function createFakeNotifier(): FakeNotifier {
  let failure: Error | null = null;
  const triggers: NotificationTrigger[] = [];
  const archivedCommentIds: number[] = [];
  const identifiedUsers: NotificationPerson[] = [];
  const preferenceWrites: FakeNotifier["preferenceWrites"] = [];
  const preferencesByUser = new Map<number, NotificationPreferences>();

  return {
    triggers,
    archivedCommentIds,
    identifiedUsers,
    preferenceWrites,
    feed(userId) {
      return triggers.filter(
        (t) =>
          t.recipients.some((r) => r.id === userId) &&
          !archivedCommentIds.some((id) => causedByComment(t, id))
      );
    },
    failWith(error) {
      failure = error;
    },
    async trigger(notification) {
      if (failure) throw failure;
      triggers.push(notification);
    },
    async archiveCausedByComment(commentId) {
      if (failure) throw failure;
      archivedCommentIds.push(commentId);
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
