import type { FeedNotification } from "~/lib/notification-feed";
import type {
  NotificationDataByKind,
  NotificationKind,
  NotificationKindAndData,
} from "~/lib/notifications";
import { formatPrice } from "~/lib/utils";

// ─── Notifications: the presenter ───
// Pure: turns a Notification from the feed into what one popover row shows.
// Row text is written here from the Cadence data the trigger carried, never
// from Knock templates, so a Notification reads as a snapshot of when it was
// sent.
//
// Adding a kind: add its entry to `PRESENTERS` below. The `Record` over every
// kind makes the compiler point here once the kind is in
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

/** How one kind of Notification reads, where it leads and its icon. */
type KindPresenter<K extends NotificationKind> = {
  icon: NotificationCategoryIcon;
  /** Title and snippet, given the sender's name ("Someone" if unnamed). */
  text(
    data: NotificationDataByKind[K],
    actor: string
  ): Pick<NotificationRow, "title" | "snippet">;
  /** Where clicking leads, or null to only mark it read. */
  href(data: NotificationDataByKind[K]): string | null;
};

/** A Discussion Notification links to its comment on the lesson. */
function commentHref(data: {
  courseSlug: string;
  lessonId: number;
  commentId: number;
}): string {
  return `/courses/${data.courseSlug}/lessons/${data.lessonId}#comment-${data.commentId}`;
}

const PRESENTERS: { [K in NotificationKind]: KindPresenter<K> } = {
  "discussion-reply": {
    icon: "discussion",
    text: (data, actor) => ({
      title: `${actor} replied to your question in ${data.lessonTitle}`,
      snippet: `“${data.snippet}”`,
    }),
    href: commentHref,
  },
  "discussion-question": {
    icon: "discussion",
    text: (data, actor) => ({
      title: `${actor} asked a question in ${data.lessonTitle}`,
      snippet: `“${data.snippet}”`,
    }),
    href: commentHref,
  },
  "seat-claimed": {
    icon: "team",
    text: (data, actor) => {
      const left = data.seatsLeft;
      return {
        title: `${actor} claimed a Seat on ${data.courseTitle}`,
        snippet:
          left === 0
            ? "No Seats left"
            : `${left} ${left === 1 ? "Seat" : "Seats"} left`,
      };
    },
    href: () => "/team",
  },
  "new-enrollment": {
    icon: "enrollment",
    text: (data, actor) => ({
      title: `${actor} enrolled in ${data.courseTitle}`,
      snippet: null,
    }),
    // The course's Students list, where the new Student now appears.
    href: (data) => `/instructor/${data.courseId}/students`,
  },
  "refund-request-confirmation": {
    icon: "refund",
    text: (data) => ({
      title: `Your refund request for ${data.courseTitle} is under review`,
      snippet: `${formatPrice(data.amount)} · We'll let you know once it's decided.`,
    }),
    // Only marks it read: the buyer has nothing to do while it is reviewed.
    href: () => null,
  },
  "open-refund-request": {
    icon: "refund",
    text: (data) => ({
      title: `${data.buyerName} requested a ${formatPrice(data.amount)} refund for ${data.courseTitle}`,
      snippet: `“${data.reason}”`,
    }),
    href: () => "/admin/refunds",
  },
  "refund-request-approved": {
    icon: "refund",
    text: (data) => {
      const note = data.decisionNote ? ` “${data.decisionNote}”` : "";
      return {
        title: `Your refund for ${data.courseTitle} was approved`,
        snippet: `${formatPrice(data.amount)} for Purchase #${data.purchaseId} is on its way back to you.${note}`,
      };
    },
    // The buyer's Refund Requests, with their decision notes.
    href: () => "/settings",
  },
  "refund-request-declined": {
    icon: "refund",
    text: (data) => ({
      title: `Your refund request for ${data.courseTitle} was declined`,
      snippet: `“${data.decisionNote}” You can raise a new refund request.`,
    }),
    href: () => "/settings",
  },
};

/**
 * Where a Notification leads, or null when it goes nowhere. Also used by the
 * Knock adapter for the workflow's action URL.
 */
export function notificationHref<K extends NotificationKind>(
  notification: NotificationKindAndData<K>
): string | null {
  return PRESENTERS[notification.kind].href(notification.data);
}

function describe<K extends NotificationKind>(
  notification: NotificationKindAndData<K>,
  actor: string
): Pick<NotificationRow, "title" | "snippet" | "categoryIcon"> {
  const presenter = PRESENTERS[notification.kind];
  return {
    ...presenter.text(notification.data, actor),
    categoryIcon: presenter.icon,
  };
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
