import type {
  NotificationDataByKind,
  NotificationFeedCredentials,
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
// One client per signed-in person holds one live connection. Nothing polls:
// Knock rate-limits rapid feed reads (429). `disconnect()` closes it.

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

/** What arrives live: new Notifications and the feed's counts after them. */
export type FeedUpdate = {
  notifications: FeedNotification[];
  counts: FeedCounts;
};

export interface NotificationFeedClient {
  /** A page of Notifications, newest first. No cursor means the first page. */
  listPage(cursor?: string | null): Promise<FeedPage>;
  getCounts(): Promise<FeedCounts>;
  /** Marks every Notification seen, including ones not loaded yet. */
  markAllSeen(): Promise<void>;
  /** Marks every Notification read, including ones not loaded yet. */
  markAllRead(): Promise<void>;
  markRead(notificationId: string): Promise<void>;
  /**
   * Calls `listener` whenever Notifications arrive live. Returns the
   * unsubscribe function.
   */
  subscribe(listener: (update: FeedUpdate) => void): () => void;
  /**
   * Newer credentials for the same person: the page signs a fresh token on
   * every navigation. The client switches to them only when its own token is
   * about to expire, so navigating doesn't reconnect. Credentials for anyone
   * else are ignored (a user switch builds a new client instead).
   */
  offerCredentials(credentials: NotificationFeedCredentials): void;
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
  async markAllRead() {},
  async markRead() {},
  subscribe() {
    return () => {};
  },
  offerCredentials() {},
  disconnect() {},
};
