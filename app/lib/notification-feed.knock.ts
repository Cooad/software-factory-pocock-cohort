import Knock, { type Feed, type FeedEventPayload } from "@knocklabs/client";
import { z } from "zod";
import type {
  FeedCounts,
  FeedNotification,
  FeedPage,
  FeedUpdate,
  NotificationFeedClient,
} from "~/lib/notification-feed";
import {
  NOTIFICATION_SCHEMAS,
  type NotificationFeedCredentials,
} from "~/lib/notifications";
import { kindForWorkflow } from "~/lib/notifications.knock";

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

/** The fields Cadence reads from a Knock feed item. */
const knockFeedItemSchema = z.object({
  id: z.string(),
  source: z.object({ key: z.string() }),
  actors: z.array(
    z.object({
      name: z.string().nullish(),
      avatar: z.string().nullish(),
    })
  ),
  data: z.unknown(),
  inserted_at: z.string(),
  seen_at: z.string().nullable(),
  read_at: z.string().nullable(),
});

const knockFeedMetadataSchema = z.object({
  unseen_count: z.number(),
  unread_count: z.number(),
});

const knockFeedResponseSchema = z.object({
  entries: z.array(z.unknown()),
  meta: knockFeedMetadataSchema,
  page_info: z.object({ after: z.string().nullish() }),
});

/**
 * One Knock feed item as a Cadence Notification, or null when it is from a
 * workflow Cadence doesn't know or doesn't fit its kind's data shape.
 */
function toNotification(raw: unknown): FeedNotification | null {
  const item = knockFeedItemSchema.safeParse(raw);
  if (!item.success) return null;
  const { id, source, actors, data, inserted_at, seen_at, read_at } = item.data;
  const kind = kindForWorkflow(source.key);
  if (!kind) return null;
  const actor = actors[0];
  const kindAndData = NOTIFICATION_SCHEMAS[kind].safeParse({ kind, data });
  if (!kindAndData.success) return null;
  return {
    ...kindAndData.data,
    id,
    actor: actor
      ? { name: actor.name ?? "", avatarUrl: actor.avatar || null }
      : null,
    insertedAt: inserted_at,
    seenAt: seen_at,
    readAt: read_at,
  };
}

/** Knock feed items as Notifications; malformed or unknown items are dropped. */
export function toNotifications(items: unknown[]): FeedNotification[] {
  return items
    .map(toNotification)
    .filter((n): n is FeedNotification => n !== null);
}

function toCounts(metadata: unknown): FeedCounts {
  const meta = knockFeedMetadataSchema.parse(metadata);
  return { unseen: meta.unseen_count, unread: meta.unread_count };
}

/** A Knock feed response as a page. Throws if it isn't a feed response. */
export function parseFeedPage(response: unknown): FeedPage {
  const page = knockFeedResponseSchema.parse(response);
  return {
    notifications: toNotifications(page.entries),
    counts: toCounts(page.meta),
    nextCursor: page.page_info.after ?? null,
  };
}

export function createKnockFeedClient(
  credentials: NotificationFeedCredentials
): NotificationFeedClient {
  const knock = new Knock(credentials.publicApiKey);
  knock.authenticate(credentials.userId, credentials.userToken);
  const feed: Feed = knock.feeds.initialize(credentials.feedChannelId, {
    page_size: PAGE_SIZE,
  });

  async function fetchPage(cursor?: string | null): Promise<unknown> {
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      const result = await feed.fetch(cursor ? { after: cursor } : {});
      if (result) {
        if (result.status !== "ok") break;
        return result.data;
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
      return parseFeedPage(await fetchPage(cursor));
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
