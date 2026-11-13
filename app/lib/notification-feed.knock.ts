import Knock, {
  type Feed,
  type FeedItem,
  type FeedResponse,
} from "@knocklabs/client";
import type {
  FeedNotification,
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
// Nothing polls: Knock rate-limits rapid feed reads (429). #34 adds live
// updates through `feed.listenForUpdates()` on this same `Feed`.

const PAGE_SIZE = 20;

/** Knock workflow key -> Cadence Notification kind. Unknown keys are hidden. */
const KIND_BY_WORKFLOW: Record<string, NotificationKind> = {
  "discussion-reply": "discussion-reply",
  "discussion-question": "discussion-question",
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

export function createKnockFeedClient(
  credentials: NotificationFeedCredentials
): NotificationFeedClient {
  const knock = new Knock(credentials.publicApiKey);
  knock.authenticate(credentials.userId, credentials.userToken);
  const feed: Feed = knock.feeds.initialize(credentials.feedChannelId, {
    page_size: PAGE_SIZE,
  });

  async function fetchPage(cursor?: string | null): Promise<FeedResponse> {
    const result = await feed.fetch(cursor ? { after: cursor } : {});
    if (!result || result.status !== "ok") {
      throw new Error("Could not load Notifications");
    }
    return result.data as FeedResponse;
  }

  return {
    async listPage(cursor) {
      const page = await fetchPage(cursor);
      return {
        notifications: page.entries
          .map(toNotification)
          .filter((n): n is FeedNotification => n !== null),
        counts: {
          unseen: page.meta.unseen_count,
          unread: page.meta.unread_count,
        },
        nextCursor: page.page_info.after ?? null,
      };
    },

    async getCounts() {
      const { metadata } = feed.getState();
      return { unseen: metadata.unseen_count, unread: metadata.unread_count };
    },

    async markAllSeen() {
      // Bulk by channel, so Notifications that aren't loaded are covered too.
      await feed.markAllAsSeen();
    },

    async markRead(notificationId) {
      const item = feed
        .getState()
        .items.find((candidate) => candidate.id === notificationId);
      if (item) await feed.markAsRead(item);
    },

    disconnect() {
      feed.dispose();
      knock.teardown();
    },
  };
}
