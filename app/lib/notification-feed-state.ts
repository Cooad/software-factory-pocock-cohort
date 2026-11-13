import type {
  FeedCounts,
  FeedNotification,
  FeedPage,
} from "~/lib/notification-feed";

// ─── Notification Feed: what the popover holds ───
// Pure. The bell keeps one of these per signed-in person and feeds it events
// from the client port: pages as the person scrolls, live Notifications from
// the socket, and their own mark-read / mark-seen actions.

export type FeedState = {
  /** Everything loaded so far, newest first, each Notification once. */
  notifications: FeedNotification[];
  counts: FeedCounts;
  /** Whether the first page has arrived. */
  loaded: boolean;
  /** Cursor for the next (older) page; null when every page is loaded. */
  nextCursor: string | null;
};

export type FeedEvent =
  | { type: "page-loaded"; page: FeedPage }
  /** Notifications that arrived live, with the feed's counts after them. */
  | { type: "received"; notifications: FeedNotification[]; counts: FeedCounts }
  | { type: "marked-read"; id: string; at: string }
  /** Covers Notifications not loaded yet, so the counts go to zero. */
  | { type: "marked-all-read"; at: string }
  | { type: "marked-all-seen"; at: string };

export const initialFeedState: FeedState = {
  notifications: [],
  counts: { unseen: 0, unread: 0 },
  loaded: false,
  nextCursor: null,
};

export function hasMorePages(state: FeedState): boolean {
  return !state.loaded || state.nextCursor !== null;
}

/** Newer copies replace older ones; newest first. */
function merge(
  loaded: FeedNotification[],
  incoming: FeedNotification[]
): FeedNotification[] {
  const byId = new Map(loaded.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) =>
    b.insertedAt.localeCompare(a.insertedAt)
  );
}

export function feedReducer(state: FeedState, event: FeedEvent): FeedState {
  switch (event.type) {
    case "page-loaded":
      return {
        notifications: merge(state.notifications, event.page.notifications),
        counts: event.page.counts,
        loaded: true,
        nextCursor: event.page.nextCursor,
      };
    case "received":
      return {
        ...state,
        notifications: merge(state.notifications, event.notifications),
        counts: event.counts,
      };
    case "marked-read": {
      const target = state.notifications.find((n) => n.id === event.id);
      if (!target || target.readAt !== null) return state;
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === event.id ? { ...n, readAt: event.at } : n
        ),
        counts: {
          ...state.counts,
          unread: Math.max(0, state.counts.unread - 1),
        },
      };
    }
    case "marked-all-read":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.readAt === null ? { ...n, readAt: event.at } : n
        ),
        counts: { ...state.counts, unread: 0 },
      };
    case "marked-all-seen":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.seenAt === null ? { ...n, seenAt: event.at } : n
        ),
        counts: { ...state.counts, unseen: 0 },
      };
  }
}
