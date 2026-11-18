import { z } from "zod";

// Safe to import from both server and browser code: the server sends
// Notification data in these shapes and the browser parses it back with the
// same schemas.

/** Kept flat: Knock's compact feed drops nested values. */
export const notificationDataSchemas = {
  "discussion-reply": z.object({
    commentId: z.number(),
    questionId: z.number(),
    lessonId: z.number(),
    lessonTitle: z.string(),
    snippet: z.string(),
    url: z.string(),
  }),
  "seat-claimed": z.object({
    seatId: z.number(),
    courseId: z.number(),
    courseTitle: z.string(),
    seatsLeft: z.number(),
    url: z.string(),
  }),
  "new-enrollment": z.object({
    enrollmentId: z.number(),
    courseId: z.number(),
    courseTitle: z.string(),
    url: z.string(),
  }),
  "discussion-question": z.object({
    commentId: z.number(),
    lessonId: z.number(),
    lessonTitle: z.string(),
    snippet: z.string(),
    url: z.string(),
  }),
  // No `url`: Cadence sends it itself and there is nowhere to click.
  "refund-requested": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    amount: z.string(),
  }),
  "refund-request-open": z.object({
    refundRequestId: z.number(),
    buyerName: z.string(),
    courseTitle: z.string(),
    amount: z.string(),
    reason: z.string(),
    url: z.string(),
  }),
  "refund-approved": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    purchaseKind: z.enum(["individual_purchase", "team_licence"]),
    amount: z.string(),
    decisionNote: z.string().nullable(),
    url: z.string(),
  }),
  "refund-declined": z.object({
    refundRequestId: z.number(),
    courseTitle: z.string(),
    purchaseKind: z.enum(["individual_purchase", "team_licence"]),
    amount: z.string(),
    decisionNote: z.string(),
    url: z.string(),
  }),
};

export type NotificationKind = keyof typeof notificationDataSchemas;

export type NotificationData<K extends NotificationKind> = z.infer<
  (typeof notificationDataSchemas)[K]
>;

export type FeedCredentials = {
  userId: string;
  userToken: string;
  publicKey: string;
  feedChannelId: string;
};

type FeedNotificationOf<K extends NotificationKind> = {
  id: string;
  kind: K;
  data: NotificationData<K>;
  /** Null for Notifications Cadence sends itself. */
  actor: { name: string; avatarUrl: string | null } | null;
  insertedAt: string;
  readAt: string | null;
  seenAt: string | null;
};

export type FeedNotification = {
  [K in NotificationKind]: FeedNotificationOf<K>;
}[NotificationKind];

export type FeedState = {
  /** Newest first. */
  notifications: FeedNotification[];
  unseenCount: number;
  unreadCount: number;
  status: "loading" | "ready" | "error";
  hasMore: boolean;
  loadingMore: boolean;
};

/** Feed components only ever talk to this, never to Knock. */
export interface NotificationFeed {
  getState(): FeedState;
  subscribe(listener: () => void): () => void;
  /** No-op when there are no older Notifications. */
  loadMore(): Promise<void>;
  /** Skips already-read ones and never sends an empty batch. */
  markRead(ids: string[]): Promise<void>;
  /** Covers Notifications not loaded yet too. Seen isn't read. */
  markAllSeen(): Promise<void>;
  /** Covers Notifications not loaded yet too. */
  markAllRead(): Promise<void>;
  /** The feed is unusable afterwards. */
  dispose(): void;
}

const EMPTY_STATE: FeedState = {
  notifications: [],
  unseenCount: 0,
  unreadCount: 0,
  status: "ready",
  hasMore: false,
  loadingMore: false,
};

export function emptyNotificationFeed(): NotificationFeed {
  return {
    getState: () => EMPTY_STATE,
    subscribe: () => () => {},
    loadMore: async () => {},
    markRead: async () => {},
    markAllSeen: async () => {},
    markAllRead: async () => {},
    dispose: () => {},
  };
}

export function badgeLabel(unseenCount: number): string | null {
  if (unseenCount <= 0) return null;
  return unseenCount > 9 ? "9+" : String(unseenCount);
}

/**
 * When this is empty, callers must send nothing: Knock answers an empty batch
 * with a 422.
 */
export function unreadAmong(
  notifications: { id: string; readAt: string | null }[],
  ids: string[]
): string[] {
  return notifications
    .filter((n) => ids.includes(n.id) && !n.readAt)
    .map((n) => n.id);
}

/**
 * `navigateTo` is null for a row with nowhere to go, so the popover stays
 * open.
 */
export function clickNotification(
  notification: { id: string; readAt: string | null },
  url: string | null | undefined
): { markRead: string[]; navigateTo: string | null } {
  return {
    markRead: notification.readAt ? [] : [notification.id],
    navigateTo: url ? url : null,
  };
}

/**
 * Null when the kind is unknown or the data doesn't match, e.g. an entry sent
 * by an older Cadence.
 */
export function parseFeedNotification(entry: {
  id: string;
  kind: string;
  data: unknown;
  actor: FeedNotification["actor"];
  insertedAt: string;
  readAt: string | null;
  seenAt: string | null;
}): FeedNotification | null {
  if (!isNotificationKind(entry.kind)) return null;
  const parsed = notificationDataSchemas[entry.kind].safeParse(entry.data);
  if (!parsed.success) return null;
  // TS can't correlate kind with its parsed data across the union; the schema
  // lookup by entry.kind guarantees they match.
  return { ...entry, kind: entry.kind, data: parsed.data } as FeedNotification;
}

function isNotificationKind(kind: string): kind is NotificationKind {
  return Object.hasOwn(notificationDataSchemas, kind);
}
