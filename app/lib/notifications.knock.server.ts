import Knock, { NotFoundError, signUserToken } from "@knocklabs/node";
import type { NotificationKind } from "~/lib/notifications";
import {
  NOTIFICATION_CHANNELS,
  PREFERENCE_CATEGORIES,
  type NotificationChannel,
  type NotificationPreferences,
  type PreferenceCategory,
} from "~/lib/notification-preferences";
import { notificationHref } from "~/lib/notification-presenter";
import type {
  KnockConfig,
  NotificationPerson,
  NotificationTrigger,
  Notifier,
} from "~/lib/notifications.server";

// ─── Notifications: Knock server adapter ───
// The only server code that talks to Knock. Maps Cadence's Notification kinds
// to the workflow keys defined in `knock/workflows/` and Cadence users to Knock
// users (Knock user id = Cadence user id as a string).

const WORKFLOW_KEY: Record<NotificationKind, string> = {
  "discussion-reply": "discussion-reply",
};

/** Cadence preference category → Knock category key (see knock/workflows). */
const CATEGORY_KEY: Record<PreferenceCategory, string> = {
  "refund-request-updates": "refund-request-updates",
  "open-refund-requests": "open-refund-requests",
  "seat-claims": "seat-claims",
  enrollments: "enrollments",
  "discussion-questions": "discussion-questions",
  "discussion-replies": "discussion-replies",
};

/** Cadence channel → Knock channel type. */
const CHANNEL_TYPE: Record<NotificationChannel, "in_app_feed"> = {
  feed: "in_app_feed",
};

/** Cadence uses Knock's per-user preference set called "default". */
const PREFERENCE_SET_ID = "default";

const USER_TOKEN_TTL_SECONDS = 60 * 60;

type KnockCategories = NonNullable<
  Awaited<ReturnType<Knock["users"]["getPreferences"]>>["categories"]
>;

function toKnockCategories(preferences: NotificationPreferences) {
  return Object.fromEntries(
    PREFERENCE_CATEGORIES.map((category) => [
      CATEGORY_KEY[category],
      {
        channel_types: Object.fromEntries(
          NOTIFICATION_CHANNELS.map((channel) => [
            CHANNEL_TYPE[channel],
            preferences[category][channel],
          ])
        ),
      },
    ])
  );
}

// Knock delivers when a category or channel type is missing from the set, so
// a missing entry reads as on.
function fromKnockCategories(
  categories: KnockCategories
): NotificationPreferences {
  return Object.fromEntries(
    PREFERENCE_CATEGORIES.map((category) => {
      const setting = categories[CATEGORY_KEY[category]];
      return [
        category,
        Object.fromEntries(
          NOTIFICATION_CHANNELS.map((channel) => {
            if (typeof setting === "boolean") return [channel, setting];
            const value = setting?.channel_types?.[CHANNEL_TYPE[channel]];
            return [channel, typeof value === "boolean" ? value : true];
          })
        ),
      ];
    })
  ) as NotificationPreferences;
}

function toKnockUser(person: NotificationPerson) {
  return {
    id: String(person.id),
    name: person.name,
    email: person.email,
    // Knock's standard property: the feed resolves it on every read.
    avatar: person.avatarUrl,
  };
}

export function knockNotifier(config: KnockConfig): Notifier {
  const knock = new Knock({ apiKey: config.secretApiKey });

  return {
    async trigger(notification) {
      await knock.workflows.trigger(
        WORKFLOW_KEY[notification.kind],
        {
          recipients: notification.recipients.map(toKnockUser),
          actor: notification.actor ? toKnockUser(notification.actor) : null,
          // Knock's templates need an action URL; Cadence decides it.
          data: { ...notification.data, url: notificationHref(notification) },
        },
        { idempotencyKey: notification.idempotencyKey }
      );
    },

    async feedCredentials(userId) {
      const { publicApiKey, signingKey, feedChannelId } = config;
      if (!publicApiKey || !signingKey || !feedChannelId) return null;
      return {
        userId: String(userId),
        userToken: await signUserToken(String(userId), {
          signingKey,
          expiresInSeconds: USER_TOKEN_TTL_SECONDS,
        }),
        publicApiKey,
        feedChannelId,
      };
    },

    async identifyUser(person) {
      const { id, ...properties } = toKnockUser(person);
      await knock.users.update(id, properties);
    },

    async getPreferences(userId) {
      try {
        const set = await knock.users.getPreferences(
          String(userId),
          PREFERENCE_SET_ID
        );
        // Knock answers with an all-null "default" set for a user who has
        // never had preferences written, so no categories means none.
        const categories = set.categories;
        if (!categories || Object.keys(categories).length === 0) return null;
        return fromKnockCategories(categories);
      } catch (error) {
        if (error instanceof NotFoundError) return null; // never identified
        throw error;
      }
    },

    async setPreferences(userId, preferences) {
      await knock.users.setPreferences(String(userId), PREFERENCE_SET_ID, {
        categories: toKnockCategories(preferences),
      });
    },
  };
}
