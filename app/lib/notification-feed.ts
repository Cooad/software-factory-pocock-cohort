import type {
  NotificationDataByKind,
  NotificationKind,
} from "~/lib/notifications";

// ─── Notifications: the client port ───
// How the feed components read and update the signed-in person's Notification
// Feed. Only the feed components use it. Adapters:
// - `createKnockFeedClient` (notification-feed.knock.ts): the official
//   `@knocklabs/client` SDK, authenticated with the public key and the signed
//   user token from loader data. Browser only, so import it dynamically.
// - `emptyFeedClient` (below): used when the server has no feed (no Knock
//   keys). Shows "You're all caught up."
//
// Later work (#34) extends this port with `markAllRead()` and a
// `subscribe(listener)` for live updates over Knock's socket; `disconnect()`
// is where that socket is torn down.

/** One Notification as the feed holds it, in Cadence's language. */
export type FeedNotification = {
  [K in NotificationKind]: {
    id: string;
    kind: K;
    /** The sender, or null when Cadence itself sent it. */
    actor: { name: string; avatarUrl: string | null } | null;
    data: NotificationDataByKind[K];
    insertedAt: string;
    seenAt: string | null;
    readAt: string | null;
  };
}[NotificationKind];

export type FeedCounts = { unseen: number; unread: number };

export type FeedPage = {
  notifications: FeedNotification[];
  counts: FeedCounts;
  /** Pass to `listPage` for the next (older) page; null when there is none. */
  nextCursor: string | null;
};

export interface NotificationFeedClient {
  /** A page of Notifications, newest first. No cursor means the first page. */
  listPage(cursor?: string | null): Promise<FeedPage>;
  getCounts(): Promise<FeedCounts>;
  /** Marks every Notification seen, including ones not loaded yet. */
  markAllSeen(): Promise<void>;
  markRead(notificationId: string): Promise<void>;
  /** Releases the connection; the client is unusable afterwards. */
  disconnect(): void;
}

export const emptyFeedClient: NotificationFeedClient = {
  async listPage() {
    return { notifications: [], counts: { unseen: 0, unread: 0 }, nextCursor: null };
  },
  async getCounts() {
    return { unseen: 0, unread: 0 };
  },
  async markAllSeen() {},
  async markRead() {},
  disconnect() {},
};
