import { describe, it, expect, beforeEach } from "vitest";
import { LessonProgressStatus } from "~/db/schema";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { createCourseRoster } from "../index.server";
import {
  addCourse,
  addLesson,
  addModule,
  addQuiz,
  addStudent,
  attemptQuiz,
  enroll,
  recordProgress,
} from "./fixtures";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let courseId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  courseId = base.course.id;
});

function roster() {
  return createCourseRoster(db).get(courseId);
}

function fourLessons() {
  const second = addModule(db, courseId, 2);
  const first = addModule(db, courseId, 1);
  return [
    addLesson(db, { moduleId: first.id, title: "Intro", position: 1 }),
    addLesson(db, { moduleId: first.id, title: "Setup", position: 2 }),
    addLesson(db, { moduleId: second.id, title: "Deep dive", position: 2 }),
    addLesson(db, { moduleId: second.id, title: "Basics", position: 1 }),
  ];
}

describe("courseRoster.get", () => {
  it("is empty for a course nobody is enrolled in", () => {
    fourLessons();
    expect(roster()).toEqual({ students: [], quizCount: 0 });
  });

  it("lists each enrolled student with their name, email and dates", () => {
    const ada = addStudent(db, "Ada Lovelace");
    enroll(db, {
      userId: ada.id,
      courseId,
      enrolledAt: "2026-02-03T00:00:00.000Z",
      completedAt: "2026-03-04",
    });

    expect(roster().students).toEqual([
      {
        userId: ada.id,
        name: "Ada Lovelace",
        email: "ada.lovelace@example.com",
        enrolledAt: "2026-02-03T00:00:00.000Z",
        completedAt: "2026-03-04",
        progress: 0,
        quizScores: [],
      },
    ]);
  });

  it("leaves out students of other courses", () => {
    const other = addCourse(
      db,
      { instructorId: base.instructor.id, categoryId: base.category.id },
      "other"
    );
    enroll(db, { userId: addStudent(db, "Elsewhere").id, courseId: other.id });
    enroll(db, { userId: addStudent(db, "Here").id, courseId });

    expect(roster().students.map((s) => s.name)).toEqual(["Here"]);
  });

  it("counts completed lessons of this course as progress", () => {
    const lessons = fourLessons();
    const otherModule = addModule(
      db,
      addCourse(
        db,
        { instructorId: base.instructor.id, categoryId: base.category.id },
        "other"
      ).id,
      1
    );
    const otherLesson = addLesson(db, {
      moduleId: otherModule.id,
      title: "Elsewhere",
      position: 1,
    });
    const ada = addStudent(db, "Ada");
    const bob = addStudent(db, "Bob");
    enroll(db, { userId: ada.id, courseId });
    enroll(db, { userId: bob.id, courseId });
    recordProgress(db, { userId: ada.id, lessonId: lessons[0].id });
    recordProgress(db, { userId: ada.id, lessonId: lessons[1].id });
    recordProgress(db, {
      userId: ada.id,
      lessonId: lessons[2].id,
      status: LessonProgressStatus.InProgress,
    });
    recordProgress(db, { userId: ada.id, lessonId: otherLesson.id });
    recordProgress(db, { userId: bob.id, lessonId: lessons[3].id });

    const progress = Object.fromEntries(
      roster().students.map((s) => [s.name, s.progress])
    );
    expect(progress).toEqual({ Ada: 50, Bob: 25 });
  });

  it("rounds progress to a whole percent", () => {
    const first = addModule(db, courseId, 1);
    const lessons = [1, 2, 3].map((n) =>
      addLesson(db, { moduleId: first.id, title: `L${n}`, position: n })
    );
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId });
    recordProgress(db, { userId: ada.id, lessonId: lessons[0].id });
    recordProgress(db, { userId: ada.id, lessonId: lessons[1].id });

    expect(roster().students[0].progress).toBe(67);
  });

  it("gives each student their best attempt at each quiz, in lesson order", () => {
    const [intro, , deepDive, basics] = fourLessons();
    const late = addQuiz(db, deepDive.id, "Late quiz");
    const early = addQuiz(db, intro.id, "Early quiz");
    const middle = addQuiz(db, basics.id, "Middle quiz");
    addQuiz(db, basics.id, "Second quiz on one lesson");
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: early.id,
      score: 0.5,
      passed: false,
    });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: early.id,
      score: 0.9,
      passed: true,
    });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: early.id,
      score: 0.6,
      passed: false,
    });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: late.id,
      score: 0.4,
      passed: false,
    });
    attemptQuiz(db, {
      userId: addStudent(db, "Other").id,
      quizId: middle.id,
      score: 1,
      passed: true,
    });

    const { students, quizCount } = roster();

    expect(quizCount).toBe(3);
    expect(students[0].quizScores).toEqual([
      {
        quizId: early.id,
        quizTitle: "Early quiz",
        lessonTitle: "Intro",
        bestScore: 0.9,
        passed: true,
      },
      {
        quizId: middle.id,
        quizTitle: "Middle quiz",
        lessonTitle: "Basics",
        bestScore: null,
        passed: null,
      },
      {
        quizId: late.id,
        quizTitle: "Late quiz",
        lessonTitle: "Deep dive",
        bestScore: 0.4,
        passed: false,
      },
    ]);
  });

  it("keeps the first of two equally good attempts", () => {
    const [intro] = fourLessons();
    const quiz = addQuiz(db, intro.id, "Quiz");
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: quiz.id,
      score: 0.8,
      passed: true,
    });
    attemptQuiz(db, {
      userId: ada.id,
      quizId: quiz.id,
      score: 0.8,
      passed: false,
    });

    expect(roster().students[0].quizScores[0]).toMatchObject({
      bestScore: 0.8,
      passed: true,
    });
  });
});
