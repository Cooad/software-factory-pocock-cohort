// ─── Notifications: preferences ───
// What a person has chosen to receive, per preference category × channel.
// Cadence's language only: adapters map these keys to the vendor's (see
// `notifications.knock.server.ts`). Shared by the server and the browser, so
// the `/settings` Notifications card can use the same names.
//
// Adding a kind means giving it a category in `PREFERENCE_CATEGORY_BY_KIND`.
// Adding a channel later (email) means adding it to `NOTIFICATION_CHANNELS`
// and to the defaults below; no migration.

import type { NotificationKind } from "~/lib/notifications";

export const PREFERENCE_CATEGORIES = [
  "refund-request-updates",
  "open-refund-requests",
  "seat-claims",
  "enrollments",
  "discussion-questions",
  "discussion-replies",
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

/**
 * The category each Notification kind is filed under, which is what a person
 * mutes. Mirrors the `categories` of each workflow in `knock/workflows/`: the
 * vendor does the filtering, the fake adapter uses this to do the same.
 */
export const PREFERENCE_CATEGORY_BY_KIND: Record<
  NotificationKind,
  PreferenceCategory
> = {
  "refund-request-confirmation": "refund-request-updates",
  "refund-request-approved": "refund-request-updates",
  "refund-request-declined": "refund-request-updates",
  "open-refund-request": "open-refund-requests",
  "seat-claimed": "seat-claims",
  "new-enrollment": "enrollments",
  "discussion-question": "discussion-questions",
  "discussion-reply": "discussion-replies",
};

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
