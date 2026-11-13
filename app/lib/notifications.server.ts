import { existsSync } from "node:fs";
import type {
  NotificationDataByKind,
  NotificationFeedCredentials,
  NotificationKind,
} from "~/lib/notifications";
import { knockNotifier } from "~/lib/notifications.knock.server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "~/lib/notification-preferences";

// ─── Notifications: the server port ───
// How Cadence sends Notifications, shaped like `MailTransport`. Services take a
// `Notifier` as a parameter (next to `db` and `now`), so tests hand in the fake
// from `notifications.fake.server.ts` and routes hand in `defaultNotifier()`.
//
// No code outside an adapter touches the vendor (Knock). Adapters:
// - `knockNotifier` (notifications.knock.server.ts): used when the Knock secret
//   key is set.
// - `loggingNotifier` (below): logs triggers and has no feed. Used without
//   keys, mirroring the mailer's `.outbox` fallback.
// - `createFakeNotifier` (notifications.fake.server.ts): tests only.

/** A Cadence user, identified inline so a trigger works without a prior sync. */
export type NotificationPerson = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type NotificationTrigger<K extends NotificationKind = NotificationKind> =
  {
    [Kind in K]: {
      kind: Kind;
      recipients: NotificationPerson[];
      /** The sender, or null when Cadence itself sends it. */
      actor: NotificationPerson | null;
      data: NotificationDataByKind[Kind];
      /** One per domain event, e.g. `discussion-reply:<commentId>`. */
      idempotencyKey: string;
    };
  }[K];

export interface Notifier {
  trigger(notification: NotificationTrigger): Promise<void>;
  /**
   * Signs feed credentials for a Cadence user, or null when this adapter has no
   * feed (the browser then shows an empty one).
   */
  feedCredentials(userId: number): Promise<NotificationFeedCredentials | null>;
  /**
   * Archives every Notification a comment caused (the ones whose trigger data
   * has this `commentId`), taking them out of their recipients' feeds. Used when
   * a Discussion Question or Reply is soft-deleted.
   */
  archiveCausedByComment(commentId: number): Promise<void>;
  /**
   * Creates or updates the user at the vendor (name, email, avatar). Role is
   * never sent. Callers use `syncUser`, which also writes the defaults.
   */
  identifyUser(person: NotificationPerson): Promise<void>;
  /** The user's stored preference set, or null when they have none yet. */
  getPreferences(userId: number): Promise<NotificationPreferences | null>;
  /** Replaces the user's whole preference set. */
  setPreferences(
    userId: number,
    preferences: NotificationPreferences
  ): Promise<void>;
}

/**
 * Sends a Notification without ever failing the caller: Notifications are
 * best-effort, so a vendor outage is logged and the domain action carries on.
 */
export async function notifySafely(
  notifier: Notifier,
  notification: NotificationTrigger
): Promise<void> {
  try {
    await notifier.trigger(notification);
  } catch (error) {
    console.error(
      `[notifications] ${notification.kind} (${notification.idempotencyKey}) failed:`,
      error
    );
  }
}

/** Archives a comment's Notifications without ever failing the caller. */
export async function archiveCausedByCommentSafely(
  notifier: Notifier,
  commentId: number
): Promise<void> {
  try {
    await notifier.archiveCausedByComment(commentId);
  } catch (error) {
    console.error(
      `[notifications] archiving for comment ${commentId} failed:`,
      error
    );
  }
}

/**
 * Keeps a Cadence user in sync with the vendor: identifies them, and writes the
 * default preference set only if they have none yet, so a choice they've made
 * is never reset. Safe to run again. Callers use `syncUserSafely`.
 */
export async function syncUser(
  notifier: Notifier,
  person: NotificationPerson
): Promise<void> {
  await notifier.identifyUser(person);
  const existing = await notifier.getPreferences(person.id);
  if (existing === null) {
    await notifier.setPreferences(person.id, DEFAULT_NOTIFICATION_PREFERENCES);
  }
}

/**
 * `syncUser` that logs a failure instead of failing the caller's action.
 * Returns whether the sync succeeded.
 */
export async function syncUserSafely(
  notifier: Notifier,
  person: NotificationPerson
): Promise<boolean> {
  try {
    await syncUser(notifier, person);
    return true;
  } catch (error) {
    console.error(`[notifications] syncing user ${person.id} failed:`, error);
    return false;
  }
}

export function loggingNotifier(): Notifier {
  return {
    async trigger(notification) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY, not sent) ${notification.kind} to ${notification.recipients
          .map((r) => r.id)
          .join(", ")} key=${notification.idempotencyKey}`
      );
    },
    async feedCredentials() {
      return null;
    },
    async archiveCausedByComment(commentId) {
      console.info(
        `[notifications] (no KNOCK_SECRET_API_KEY, not sent) archive for comment ${commentId}`
      );
    },
    // User sync is silent without keys, or the seed would log every user.
    async identifyUser() {},
    async getPreferences() {
      return null;
    },
    async setPreferences() {},
  };
}

// Vite doesn't put non-VITE_ .env values on process.env, so load them here.
// Tests and CI have no .env, hence the guard.
function loadEnv() {
  if (!process.env.KNOCK_SECRET_API_KEY && !process.env.KNOCK_API_KEY) {
    if (existsSync(".env")) process.loadEnvFile(".env");
  }
}

export type KnockConfig = {
  secretApiKey: string;
  publicApiKey: string | undefined;
  signingKey: string | undefined;
  feedChannelId: string | undefined;
};

/** Knock config from the environment, or null without a secret key. */
export function knockConfigFromEnv(): KnockConfig | null {
  loadEnv();
  const secretApiKey =
    process.env.KNOCK_SECRET_API_KEY || process.env.KNOCK_API_KEY;
  if (!secretApiKey) return null;
  return {
    secretApiKey,
    publicApiKey: process.env.KNOCK_PUBLIC_API_KEY || undefined,
    signingKey: process.env.KNOCK_SIGNING_KEY || undefined,
    feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID || undefined,
  };
}

let cachedDefault: Notifier | undefined;

/** Knock when its secret key is set, otherwise the logging adapter. */
export function defaultNotifier(): Notifier {
  if (!cachedDefault) {
    const config = knockConfigFromEnv();
    cachedDefault = config ? knockNotifier(config) : loggingNotifier();
  }
  return cachedDefault;
}
