import * as schema from "~/db/schema";
import { LessonProgressStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import type { TestDb } from "~/test/setup";

// The roster only reads. Enrollments, progress and quiz attempts are written
// by other parts of the app, so the fixtures insert rows directly. Kept in one
// place so a schema change touches only this file.

export function addStudent(db: TestDb, name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

export function addCourse(
  db: TestDb,
  from: { instructorId: number; categoryId: number },
  slug: string
) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: slug,
      salesCopy: markdown(slug),
      instructorId: from.instructorId,
      categoryId: from.categoryId,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

export function addModule(db: TestDb, courseId: number, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title: `Module ${position}`, position })
    .returning()
    .get();
}

export function addLesson(
  db: TestDb,
  lesson: { moduleId: number; title: string; position: number }
) {
  return db.insert(schema.lessons).values(lesson).returning().get();
}

export function addQuiz(db: TestDb, lessonId: number, title: string) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore: 0.7 })
    .returning()
    .get();
}

export function enroll(
  db: TestDb,
  enrollment: {
    userId: number;
    courseId: number;
    enrolledAt?: string;
    completedAt?: string | null;
  }
) {
  return db
    .insert(schema.enrollments)
    .values({ enrolledAt: "2026-01-01T00:00:00.000Z", ...enrollment })
    .returning()
    .get();
}

export function recordProgress(
  db: TestDb,
  progress: {
    userId: number;
    lessonId: number;
    status?: LessonProgressStatus;
  }
) {
  db.insert(schema.lessonProgress)
    .values({ status: LessonProgressStatus.Completed, ...progress })
    .run();
}

export function attemptQuiz(
  db: TestDb,
  attempt: { userId: number; quizId: number; score: number; passed: boolean }
) {
  db.insert(schema.quizAttempts).values(attempt).run();
}
