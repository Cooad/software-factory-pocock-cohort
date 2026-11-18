import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { createLesson, createModule } from "./course-content.server";
import { createStudent } from "./users.server";
import { MAX_NOTE_LENGTH } from "./notes";
import { getNote, listNotes, saveNote } from "./notes.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

const at = (minute: number) => new Date(2026, 10, 18, 12, minute, 0);

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = createModule(db, base.course.id, "Basics");
  lessonIds = [1, 2, 3].map(
    (n) => createLesson(db, module.id, `Lesson ${n}`).id
  );
});

describe("saving a Note", () => {
  it("creates a Note on a Lesson with none, trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  # not a heading *  ", at(0));

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading *",
      updatedAt: at(0).toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", at(0));
    saveNote(db, base.user.id, lessonIds[0], "Second thought", at(7));

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: at(7).toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "First", at(0));
    saveNote(db, base.user.id, lessonIds[0], "Second", at(1));
    saveNote(db, base.user.id, lessonIds[0], "Third", at(2));

    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("clears the Note when saved empty or blank", () => {
    saveNote(db, base.user.id, lessonIds[0], "Something", at(0));

    expect(saveNote(db, base.user.id, lessonIds[0], "   \n ", at(3))).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
    expect(listNotes(db, base.user.id)).toHaveLength(0);
  });

  it("saves nothing when a Lesson with no Note is saved empty", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "", at(0)).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("accepts a Note of exactly the cap", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, at(0)).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note over the cap with a message, and stores nothing", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      at(0)
    );

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("listing Notes", () => {
  it("lists only the Student's own Notes, last edited first, with their Lesson and Course", () => {
    const student = base.user.id;
    const other = createStudent(db, "Priya", "priya@example.com").id;

    saveNote(db, student, lessonIds[0], "On lesson 1", at(0));
    saveNote(db, student, lessonIds[1], "On lesson 2", at(5));
    saveNote(db, other, lessonIds[2], "Priya's note", at(10));
    saveNote(db, student, lessonIds[0], "On lesson 1, edited", at(15));

    const listed = listNotes(db, student);

    expect(listed.map((row) => row.body)).toEqual([
      "On lesson 1, edited",
      "On lesson 2",
    ]);
    expect(listed[0]).toMatchObject({
      lessonId: lessonIds[0],
      lessonTitle: "Lesson 1",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });
});
