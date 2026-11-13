import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";

// ─── Comments ───
// Writing Discussion comments: creating a Discussion Question or Discussion
// Reply, and soft-deleting a comment. See GLOSSARY.md for the language.
//
// Every function takes the database first and `now` last, so tests can hand in
// an in-memory database and a fixed clock. Failures are thrown as Errors whose
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
 */
export function createComment(
  db: Db,
  authorId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date
): Comment {
  const trimmed = assertValidCommentBody(body);

  if (!lessonExists(db, lessonId)) {
    throw new Error("Lesson not found");
  }

  if (parentId !== null) {
    const parent = getComment(db, parentId);
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

  return db
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
}

/**
 * Soft-deletes a comment by setting `deletedAt`. Only its author may, unless
 * `isStaff` (the course's Instructor or an admin). Deleting an already
 * deleted comment changes nothing and returns it as it is.
 */
export function deleteComment(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean,
  now: Date
): Comment {
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

  return db
    .update(comments)
    .set({ deletedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}
