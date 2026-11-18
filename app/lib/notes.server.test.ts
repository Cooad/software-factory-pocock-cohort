import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
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

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

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
    saveNote(db, base.user.id, lessonIds[0], "Mine", at(0));

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Dup" })
        .run()
    ).toThrow();
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
    const other = addStudent("Priya").id;

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
