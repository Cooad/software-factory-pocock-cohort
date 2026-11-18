import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { createLesson, createModule } from "./course-content.server";
import { createStudent } from "./users.server";
import { isBookmarked, listBookmarks, toggleBookmark } from "./bookmarks.server";

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

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson with no Bookmark, and unbookmarks it on the next toggle", () => {
    const student = base.user.id;

    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);

    expect(toggleBookmark(db, student, lessonIds[0], at(0))).toBe(true);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, student, lessonIds[0], at(1))).toBe(false);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    const student = base.user.id;
    toggleBookmark(db, student, lessonIds[0], at(0));
    toggleBookmark(db, student, lessonIds[0], at(1));
    toggleBookmark(db, student, lessonIds[0], at(2));

    expect(listBookmarks(db, student)).toHaveLength(1);
  });
});

describe("listing Bookmarks", () => {
  it("lists only the Student's own Bookmarks, newest first, with their Lesson and Course", () => {
    const student = base.user.id;
    const other = createStudent(db, "Priya", "priya@example.com").id;

    toggleBookmark(db, student, lessonIds[0], at(0));
    toggleBookmark(db, student, lessonIds[2], at(5));
    toggleBookmark(db, other, lessonIds[1], at(10));

    const listed = listBookmarks(db, student);

    expect(listed.map((row) => row.lessonTitle)).toEqual([
      "Lesson 3",
      "Lesson 1",
    ]);
    expect(listed[0]).toMatchObject({
      lessonId: lessonIds[2],
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });
});
