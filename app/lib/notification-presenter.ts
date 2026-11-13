import type { FeedNotification } from "~/lib/notification-feed";
import type {
  NotificationDataByKind,
  NotificationKind,
} from "~/lib/notifications";
import { formatPrice } from "~/lib/utils";

// ─── Notifications: the presenter ───
// Pure: turns a Notification from the feed into what one popover row shows.
// Row text is written here from the Cadence data the trigger carried, never
// from Knock templates, so a Notification reads as a snapshot of when it was
// sent.
//
// Adding a kind: add a `case` to `describe` and `notificationHref` below. The
// `never` checks make the compiler point here once the kind is in
// `NotificationDataByKind`.

/** Mapped to a lucide icon by the row component. */
export type NotificationCategoryIcon =
  "discussion" | "refund" | "team" | "enrollment";

export type NotificationAvatar =
  | { kind: "sender"; name: string; avatarUrl: string | null }
  /** Cadence itself sent it: the "C" avatar. */
  | { kind: "cadence" };

export type NotificationRow = {
  id: string;
  title: string;
  snippet: string | null;
  categoryIcon: NotificationCategoryIcon;
  avatar: NotificationAvatar;
  /** Where clicking the row goes, or null to only mark it read. */
  href: string | null;
  unread: boolean;
  timeAgo: string;
};

type Description = Pick<NotificationRow, "title" | "snippet" | "categoryIcon">;

/** Kind and data, still paired, so a `switch` on `kind` narrows `data`. */
type KindAndData = {
  [K in NotificationKind]: { kind: K; data: NotificationDataByKind[K] };
}[NotificationKind];

/**
 * Where a Notification leads, or null when it goes nowhere. Also used by the
 * Knock adapter for the workflow's action URL.
 */
export function notificationHref(notification: KindAndData): string | null {
  switch (notification.kind) {
    case "discussion-reply": {
      const data = notification.data;
      return `/courses/${data.courseSlug}/lessons/${data.lessonId}#comment-${data.commentId}`;
    }
    case "discussion-question": {
      const data = notification.data;
      return `/courses/${data.courseSlug}/lessons/${data.lessonId}#comment-${data.commentId}`;
    }
    case "seat-claimed":
      return "/team";
    // Only marks it read: the buyer has nothing to do while it is reviewed.
    case "refund-request-confirmation":
      return null;
    case "open-refund-request":
      return "/admin/refunds";
    // The buyer's Refund Requests, with their decision notes.
    case "refund-request-approved":
    case "refund-request-declined":
      return "/settings";
    default: {
      // Once every kind has a case, the whole notification narrows to never.
      const unhandled: never = notification;
      const kind = (unhandled as { kind: string }).kind;
      throw new Error(`No link for Notification kind ${kind}`);
    }
  }
}

function describe(notification: FeedNotification, actor: string): Description {
  switch (notification.kind) {
    case "discussion-reply": {
      const data = notification.data;
      return {
        title: `${actor} replied to your question in ${data.lessonTitle}`,
        snippet: `“${data.snippet}”`,
        categoryIcon: "discussion",
      };
    }
    case "discussion-question": {
      const data = notification.data;
      return {
        title: `${actor} asked a question in ${data.lessonTitle}`,
        snippet: `“${data.snippet}”`,
        categoryIcon: "discussion",
      };
    }
    case "refund-request-confirmation": {
      const data = notification.data;
      return {
        title: `Your refund request for ${data.courseTitle} is under review`,
        snippet: `${formatPrice(data.amount)} · We'll let you know once it's decided.`,
        categoryIcon: "refund",
      };
    }
    case "open-refund-request": {
      const data = notification.data;
      return {
        title: `${data.buyerName} requested a ${formatPrice(data.amount)} refund for ${data.courseTitle}`,
        snippet: `“${data.reason}”`,
        categoryIcon: "refund",
      };
    }
    case "refund-request-approved": {
      const data = notification.data;
      const note = data.decisionNote ? ` “${data.decisionNote}”` : "";
      return {
        title: `Your refund for ${data.courseTitle} was approved`,
        snippet: `${formatPrice(data.amount)} for Purchase #${data.purchaseId} is on its way back to you.${note}`,
        categoryIcon: "refund",
      };
    }
    case "refund-request-declined": {
      const data = notification.data;
      return {
        title: `Your refund request for ${data.courseTitle} was declined`,
        snippet: `“${data.decisionNote}” You can raise a new refund request.`,
        categoryIcon: "refund",
      };
    }
    case "seat-claimed": {
      const data = notification.data;
      const left = data.seatsLeft;
      return {
        title: `${actor} claimed a Seat on ${data.courseTitle}`,
        snippet:
          left === 0
            ? "No Seats left"
            : `${left} ${left === 1 ? "Seat" : "Seats"} left`,
        categoryIcon: "team",
      };
    }
    default: {
      // Once every kind has a case, the whole notification narrows to never.
      const unhandled: never = notification;
      const kind = (unhandled as { kind: string }).kind;
      throw new Error(`No presenter for Notification kind ${kind}`);
    }
  }
}

export function timeAgo(insertedAt: string, now: Date): string {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(insertedAt).getTime()) / 1000)
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function presentNotification(
  notification: FeedNotification,
  now: Date
): NotificationRow {
  const actor = notification.actor;
  return {
    id: notification.id,
    ...describe(notification, actor?.name || "Someone"),
    href: notificationHref(notification),
    avatar: actor
      ? { kind: "sender", name: actor.name, avatarUrl: actor.avatarUrl }
      : { kind: "cadence" },
    unread: notification.readAt === null,
    timeAgo: timeAgo(notification.insertedAt, now),
  };
}
