import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { courses, lessons, modules, notes } from "~/db/schema";
import { noteBodySchema } from "~/lib/notes";

// ─── Notes ───
// A Student's own writing about a Lesson, private to the Student who wrote it.
// See GLOSSARY.md. Nothing outside the owning Student's Lesson page and Saved
// page may read a Note body — no Instructor or Platform Admin view.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Content access is checked by the caller (the Lesson page action).

export type Db = BetterSQLite3Database<typeof schema>;

/** The Student's Note on a Lesson, or undefined if they have not written one. */
export function getNote(db: Db, studentId: number, lessonId: number) {
  return db
    .select({ body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, studentId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  | { ok: true; note: { body: string; updatedAt: string } }
  | { ok: false; error: string };

/**
 * Creates the Student's Note on a Lesson, or replaces its body and moves
 * "last edited" on if one exists. `createdAt` is kept on a re-save. The body
 * is trimmed; one over the cap is refused, never truncated.
 */
export function saveNote(
  db: Db,
  studentId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const timestamp = now.toISOString();
  const note = db
    .insert(notes)
    .values({
      userId: studentId,
      lessonId,
      body: parsed.data,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: parsed.data, updatedAt: timestamp },
    })
    .returning({ body: notes.body, updatedAt: notes.updatedAt })
    .get();

  return { ok: true, note };
}

/** The Student's Notes, most recently edited first, each with its Lesson and Course. */
export function listNotes(db: Db, studentId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, studentId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
