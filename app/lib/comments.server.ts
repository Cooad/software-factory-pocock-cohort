import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { toSnippet } from "~/lib/notifications";
import {
  archiveCausedByCommentSafely,
  notifySafely,
  type NotificationPerson,
  type Notifier,
} from "~/lib/notifications.server";

// ─── Comments ───
// Writing Discussion comments: creating a Discussion Question or Discussion
// Reply, and soft-deleting a comment. See GLOSSARY.md for the language.
//
// Every function takes the database first and `now` last, so tests can hand in
// an in-memory database and a fixed clock. Functions that send Notifications
// take the `Notifier` port second; they send after the write and never fail
// because of it. Failures are thrown as Errors whose
// message is safe to show the user. Uses positional parameters (project
// convention).

export type Db = BetterSQLite3Database<typeof schema>;

export type Comment = typeof comments.$inferSelect;

function getComment(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function lessonExists(db: Db, lessonId: number) {
  return (
    db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .get() !== undefined
  );
}

function getPerson(db: Db, userId: number): NotificationPerson | undefined {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

function getLessonContext(db: Db, lessonId: number) {
  return db
    .select({
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

/**
 * Notification 7: tells the Discussion Question's author that someone else
 * replied. Nobody else in the thread hears about it.
 */
async function notifyDiscussionReply(
  db: Db,
  notifier: Notifier,
  reply: Comment,
  question: Comment
) {
  if (question.userId === reply.userId) return;

  const recipient = getPerson(db, question.userId);
  const actor = getPerson(db, reply.userId);
  const lesson = getLessonContext(db, reply.lessonId);
  if (!recipient || !actor || !lesson) return;

  await notifySafely(notifier, {
    kind: "discussion-reply",
    recipients: [recipient],
    actor,
    data: {
      commentId: reply.id,
      questionId: question.id,
      courseSlug: lesson.courseSlug,
      courseTitle: lesson.courseTitle,
      lessonId: reply.lessonId,
      lessonTitle: lesson.lessonTitle,
      snippet: toSnippet(reply.body),
    },
    idempotencyKey: `discussion-reply:${reply.id}`,
  });
}

/**
 * Notification 6: tells the course's Instructor that someone else (a Student,
 * or a Platform Admin) asked a Discussion Question.
 */
async function notifyDiscussionQuestion(
  db: Db,
  notifier: Notifier,
  question: Comment
) {
  const lesson = getLessonContext(db, question.lessonId);
  if (!lesson || lesson.instructorId === question.userId) return;

  const recipient = getPerson(db, lesson.instructorId);
  const actor = getPerson(db, question.userId);
  if (!recipient || !actor) return;

  await notifySafely(notifier, {
    kind: "discussion-question",
    recipients: [recipient],
    actor,
    data: {
      commentId: question.id,
      courseSlug: lesson.courseSlug,
      courseTitle: lesson.courseTitle,
      lessonId: question.lessonId,
      lessonTitle: lesson.lessonTitle,
      snippet: toSnippet(question.body),
    },
    idempotencyKey: `discussion-question:${question.id}`,
  });
}

/** Trims a comment body, throwing if it is empty or too long. */
export function assertValidCommentBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

/**
 * Creates a Discussion Question (`parentId` null) or a Discussion Reply to one.
 * Replies are one level deep: the parent must be top-level and on the same
 * lesson.
 *
 * A Discussion Question notifies the course's Instructor (unless they asked
 * it). A Discussion Reply notifies the question's author (unless they wrote
 * it).
 */
export async function createComment(
  db: Db,
  notifier: Notifier,
  authorId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date
): Promise<Comment> {
  const trimmed = assertValidCommentBody(body);

  if (!lessonExists(db, lessonId)) {
    throw new Error("Lesson not found");
  }

  let parent: Comment | undefined;
  if (parentId !== null) {
    parent = getComment(db, parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = db
    .insert(comments)
    .values({
      userId: authorId,
      lessonId,
      parentId,
      body: trimmed,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();

  if (parent) {
    await notifyDiscussionReply(db, notifier, comment, parent);
  } else {
    await notifyDiscussionQuestion(db, notifier, comment);
  }

  return comment;
}

/**
 * Edits the body of the author's own, undeleted comment. Sends and archives no
 * Notifications: they are snapshots of the comment as it was posted.
 */
export function editComment(
  db: Db,
  commentId: number,
  userId: number,
  body: string,
  now: Date
): Comment {
  const trimmed = assertValidCommentBody(body);

  const existing = getComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.deletedAt !== null) {
    throw new Error("Comment has been deleted");
  }
  if (existing.userId !== userId) {
    throw new Error("You can only edit your own comments");
  }

  return db
    .update(comments)
    .set({ body: trimmed, editedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}

/**
 * Soft-deletes a comment by setting `deletedAt`. Only its author may, unless
 * `isStaff` (the course's Instructor or an admin). Deleting an already
 * deleted comment changes nothing and returns it as it is.
 *
 * Archives the Notifications the comment caused, so they leave the feed. A
 * question's Discussion Reply Notifications stay: each belongs to its reply.
 */
export async function deleteComment(
  db: Db,
  notifier: Notifier,
  commentId: number,
  userId: number,
  isStaff: boolean,
  now: Date
): Promise<Comment> {
  const existing = getComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own comments");
  }
  if (existing.deletedAt !== null) {
    return existing;
  }

  const deleted = db
    .update(comments)
    .set({ deletedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  await archiveCausedByCommentSafely(notifier, commentId);

  return deleted;
}
