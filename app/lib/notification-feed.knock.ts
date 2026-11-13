import Knock, {
  type Feed,
  type FeedEventPayload,
  type FeedItem,
  type FeedMetadata,
  type FeedResponse,
} from "@knocklabs/client";
import type {
  FeedCounts,
  FeedNotification,
  FeedUpdate,
  NotificationFeedClient,
} from "~/lib/notification-feed";
import type {
  NotificationFeedCredentials,
  NotificationKind,
} from "~/lib/notifications";

// ─── Notifications: Knock client adapter (browser only) ───
// The only browser code that talks to Knock. Uses the official
// `@knocklabs/client` SDK, authenticated with the public key and the user
// token the server signed for the session user. Import it dynamically from an
// effect, so it never runs during server rendering.
//
// Nothing polls: Knock rate-limits rapid feed reads (429). Live updates come
// over Knock's socket (`feed.listenForUpdates()`): when a message arrives the
// SDK fetches the newer entries itself and emits "items.received.realtime".
// `disconnect()` disposes the feed and tears the socket down.

const PAGE_SIZE = 20;
/** `feed.fetch()` skips (returns undefined) while another fetch is in flight. */
const FETCH_ATTEMPTS = 10;
const FETCH_RETRY_MS = 250;

/** Knock workflow key -> Cadence Notification kind. Unknown keys are hidden. */
const KIND_BY_WORKFLOW: Record<string, NotificationKind> = {
  "discussion-reply": "discussion-reply",
  "discussion-question": "discussion-question",
  "seat-claimed": "seat-claimed",
  "refund-request-confirmation": "refund-request-confirmation",
  "open-refund-request": "open-refund-request",
  "refund-request-approved": "refund-request-approved",
  "refund-request-declined": "refund-request-declined",
};

function toNotification(item: FeedItem): FeedNotification | null {
  const kind = KIND_BY_WORKFLOW[item.source.key];
  if (!kind || !item.data) return null;
  const actor = item.actors[0];
  return {
    id: item.id,
    kind,
    actor: actor
      ? {
          name: "name" in actor && actor.name ? String(actor.name) : "",
          avatarUrl:
            "avatar" in actor && actor.avatar ? String(actor.avatar) : null,
        }
      : null,
    data: item.data,
    insertedAt: item.inserted_at,
    seenAt: item.seen_at,
    readAt: item.read_at,
  } as FeedNotification;
}

function toNotifications(items: FeedItem[]): FeedNotification[] {
  return items
    .map(toNotification)
    .filter((n): n is FeedNotification => n !== null);
}

function toCounts(metadata: FeedMetadata): FeedCounts {
  return { unseen: metadata.unseen_count, unread: metadata.unread_count };
}

export function createKnockFeedClient(
  credentials: NotificationFeedCredentials
): NotificationFeedClient {
  const knock = new Knock(credentials.publicApiKey);
  knock.authenticate(credentials.userId, credentials.userToken);
  const feed: Feed = knock.feeds.initialize(credentials.feedChannelId, {
    page_size: PAGE_SIZE,
  });

  async function fetchPage(cursor?: string | null): Promise<FeedResponse> {
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      const result = await feed.fetch(cursor ? { after: cursor } : {});
      if (result) {
        if (result.status !== "ok") break;
        return result.data as FeedResponse;
      }
      // A live update's fetch is in flight; wait for it rather than drop
      // the page the person scrolled to.
      await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_MS));
    }
    throw new Error("Could not load Notifications");
  }

  let listening = false;

  return {
    async listPage(cursor) {
      const page = await fetchPage(cursor);
      return {
        notifications: toNotifications(page.entries),
        counts: toCounts(page.meta),
        nextCursor: page.page_info.after ?? null,
      };
    },

    async getCounts() {
      return toCounts(feed.getState().metadata);
    },

    async markAllSeen() {
      // Bulk by channel, so Notifications that aren't loaded are covered too.
      await feed.markAllAsSeen();
    },

    async markAllRead() {
      // Bulk by channel, so Notifications that aren't loaded are covered too.
      await feed.markAllAsRead();
    },

    async markRead(notificationId) {
      const item = feed
        .getState()
        .items.find((candidate) => candidate.id === notificationId);
      if (item) {
        await feed.markAsRead(item);
      } else {
        // Not in the SDK's store (it drops older pages when the first page
        // is fetched again), so update the message directly.
        await knock.messages.batchUpdateStatuses([notificationId], "read");
      }
    },

    subscribe(listener: (update: FeedUpdate) => void) {
      const onReceived = (payload: FeedEventPayload) => {
        const notifications = toNotifications(payload.items);
        listener({ notifications, counts: toCounts(payload.metadata) });
      };
      feed.on("items.received.realtime", onReceived);
      if (!listening) {
        // One socket per client, so one per signed-in person.
        feed.listenForUpdates();
        listening = true;
      }
      return () => feed.off("items.received.realtime", onReceived);
    },

    disconnect() {
      feed.dispose();
      knock.teardown();
    },
  };
}
