import type { FeedNotification } from "~/lib/notification-feed";

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

type KindAndData = Pick<FeedNotification, "kind" | "data">;

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
    default: {
      const unhandled: never = notification.kind;
      throw new Error(`No link for Notification kind ${unhandled}`);
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
    default: {
      // Every kind is handled, so `notification` is `never` here.
      const unhandled: never = notification;
      throw new Error(
        `No presenter for Notification kind ${(unhandled as FeedNotification).kind}`
      );
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
