// ─── Notifications: preferences ───
// What a person has chosen to receive, per preference category × channel.
// Cadence's language only: adapters map these keys to the vendor's (see
// `notifications.knock.server.ts`). Shared by the server and the browser, so
// the `/settings` Notifications card can use the same names.
//
// Adding a channel later (email) means adding it to `NOTIFICATION_CHANNELS`
// and to the defaults below; no migration.

export const PREFERENCE_CATEGORIES = [
  "refund-request-updates",
  "open-refund-requests",
  "seat-claims",
  "enrollments",
  "discussion-questions",
  "discussion-replies",
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

/** v1 delivers to the Notification Feed only. */
export const NOTIFICATION_CHANNELS = ["feed"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type ChannelPreferences = Record<NotificationChannel, boolean>;

/** A person's full preference set: every category × every channel. */
export type NotificationPreferences = Record<
  PreferenceCategory,
  ChannelPreferences
>;

/** Enrollments off (a popular course would flood the feed), everything else on. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  "refund-request-updates": { feed: true },
  "open-refund-requests": { feed: true },
  "seat-claims": { feed: true },
  enrollments: { feed: false },
  "discussion-questions": { feed: true },
  "discussion-replies": { feed: true },
};
