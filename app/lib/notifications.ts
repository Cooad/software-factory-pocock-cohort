// ─── Notifications: the catalogue ───
// The Notification kinds Cadence sends and the Cadence-shaped data each one
// carries. Shared by the server (which triggers them) and the browser (which
// renders them through the presenter). Nothing here knows about Knock: the
// adapters map these names to the vendor's keys.
//
// Adding a kind: add it to `NotificationDataByKind` with its data shape, then
// follow the compiler (presenter, Knock adapters' key tables). See
// notes.md for spec #29.

/**
 * Data for Notification 7, sent to a Discussion Question's author when someone
 * else replies. Flat scalars only, so the vendor can filter messages by any
 * field (archiving on delete relies on `commentId`).
 */
export type DiscussionReplyData = {
  /** The reply. */
  commentId: number;
  /** The Discussion Question it answers. */
  questionId: number;
  courseSlug: string;
  courseTitle: string;
  lessonId: number;
  lessonTitle: string;
  /** The start of the reply's body, frozen when it was sent. */
  snippet: string;
};

/**
 * Data for Notification 4, sent to the Team Admin who owns a Team Licence when
 * one of its Seats is claimed. The claiming Student is the actor.
 */
export type SeatClaimedData = {
  seatId: number;
  /** The Team Licence. */
  purchaseId: number;
  courseSlug: string;
  courseTitle: string;
  /** Unclaimed Seats still on the Team Licence just after this claim. */
  seatsLeft: number;
};

/** What every Refund Request Notification says about the Purchase. */
type RefundRequestFacts = {
  refundRequestId: number;
  purchaseId: number;
  courseSlug: string;
  courseTitle: string;
  /** What the buyer paid, in integer cents (docs/adr/0005). */
  amount: number;
};

/** Notification 8: the buyer's Refund Request was received. Sent by Cadence. */
export type RefundRequestConfirmationData = RefundRequestFacts;

/** Notification 3: a new Open Refund Request, for every Platform Admin. */
export type OpenRefundRequestData = RefundRequestFacts & {
  buyerName: string;
  /** The start of the buyer's reason, frozen when it was sent. */
  reason: string;
};

/** Notification 1: a Platform Admin approved the buyer's Refund Request. */
export type RefundRequestApprovedData = RefundRequestFacts & {
  decisionNote: string | null;
};

/** Notification 2: a Platform Admin declined the buyer's Refund Request. */
export type RefundRequestDeclinedData = RefundRequestFacts & {
  decisionNote: string;
};

export type NotificationDataByKind = {
  "discussion-reply": DiscussionReplyData;
  "seat-claimed": SeatClaimedData;
  "refund-request-confirmation": RefundRequestConfirmationData;
  "open-refund-request": OpenRefundRequestData;
  "refund-request-approved": RefundRequestApprovedData;
  "refund-request-declined": RefundRequestDeclinedData;
};

export type NotificationKind = keyof NotificationDataByKind;

/**
 * What the browser needs to read one person's Notification Feed. Reaches the
 * browser through loader data. Opaque to everything but the adapters.
 */
export type NotificationFeedCredentials = {
  userId: string;
  /** Signed for `userId` only; useless for anyone else's feed. */
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
};

/** How long a snippet in trigger data may be. */
export const SNIPPET_LENGTH = 140;

export function toSnippet(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…`
    : flat;
}
