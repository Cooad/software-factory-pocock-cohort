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
 * Data for Notification 6, sent to a course's Instructor when someone else asks
 * a Discussion Question on one of its lessons. Flat scalars, like
 * `DiscussionReplyData`, so archiving on delete can find it by `commentId`.
 */
export type DiscussionQuestionData = {
  /** The Discussion Question. */
  commentId: number;
  courseSlug: string;
  courseTitle: string;
  lessonId: number;
  lessonTitle: string;
  /** The start of the question's body, frozen when it was sent. */
  snippet: string;
};

export type NotificationDataByKind = {
  "discussion-reply": DiscussionReplyData;
  "discussion-question": DiscussionQuestionData;
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
