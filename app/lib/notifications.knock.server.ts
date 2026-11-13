import Knock, { signUserToken } from "@knocklabs/node";
import type { NotificationKind } from "~/lib/notifications";
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
  "refund-request-confirmation": "refund-request-confirmation",
  "open-refund-request": "open-refund-request",
  "refund-request-approved": "refund-request-approved",
  "refund-request-declined": "refund-request-declined",
};

const USER_TOKEN_TTL_SECONDS = 60 * 60;

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
  };
}
