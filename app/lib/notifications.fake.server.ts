import type {
  NotificationTrigger,
  Notifier,
} from "~/lib/notifications.server";

// ─── Notifications: in-memory fake adapter (tests only) ───
// Records every trigger. Call `failWith(error)` to make every call throw, to
// check that domain actions survive a vendor outage.

export type FakeNotifier = Notifier & {
  triggers: NotificationTrigger[];
  failWith(error: Error | null): void;
};

export function createFakeNotifier(): FakeNotifier {
  let failure: Error | null = null;
  const triggers: NotificationTrigger[] = [];

  return {
    triggers,
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
  };
}
