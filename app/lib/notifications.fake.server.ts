import type {
  NotificationTrigger,
  Notifier,
} from "~/lib/notifications.server";

// ─── Notifications: in-memory fake adapter (tests only) ───
// Records every trigger. Call `failWith(error)` to make every call throw, to
// check that domain actions survive a vendor outage. `feed(userId)` is what that
// user's feed would show: their triggers, minus archived ones.

export type FakeNotifier = Notifier & {
  triggers: NotificationTrigger[];
  /** Comment ids passed to `archiveCausedByComment`. */
  archivedCommentIds: number[];
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

  return {
    triggers,
    archivedCommentIds,
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
  };
}
