import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  quizAttempts,
  quizzes,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type RosterQuiz = {
  quizId: number;
  quizTitle: string;
  lessonTitle: string;
};

export type QuizScore = RosterQuiz & {
  bestScore: number | null;
  passed: boolean | null;
};

export type RosterStudent = {
  userId: number;
  name: string;
  email: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
  quizScores: QuizScore[];
};

export type CourseRoster = {
  students: RosterStudent[];
  quizCount: number;
};

function getCourseLessons(db: Db, courseId: number) {
  return db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position))
    .all();
}

function getRosterQuizzes(
  db: Db,
  courseLessons: { id: number; title: string }[]
): RosterQuiz[] {
  const rows = db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      lessonId: quizzes.lessonId,
    })
    .from(quizzes)
    .where(
      inArray(
        quizzes.lessonId,
        courseLessons.map((lesson) => lesson.id)
      )
    )
    .orderBy(asc(quizzes.id))
    .all();
  return courseLessons.flatMap((lesson) => {
    const quiz = rows.find((row) => row.lessonId === lesson.id);
    if (!quiz) return [];
    return [
      { quizId: quiz.id, quizTitle: quiz.title, lessonTitle: lesson.title },
    ];
  });
}

function getEnrolledStudents(db: Db, courseId: number) {
  return db
    .select({
      userId: enrollments.userId,
      name: users.name,
      email: users.email,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, courseId))
    .all();
}

function getCompletedLessonCounts(
  db: Db,
  userIds: number[],
  lessonIds: number[]
): Map<number, number> {
  const rows = db
    .select({ userId: lessonProgress.userId, completed: count() })
    .from(lessonProgress)
    .where(
      and(
        inArray(lessonProgress.userId, userIds),
        inArray(lessonProgress.lessonId, lessonIds),
        eq(lessonProgress.status, LessonProgressStatus.Completed)
      )
    )
    .groupBy(lessonProgress.userId)
    .all();
  return new Map(rows.map((row) => [row.userId, row.completed]));
}

type BestAttempt = { score: number; passed: boolean };

function getBestAttempts(
  db: Db,
  userIds: number[],
  quizIds: number[]
): Map<string, BestAttempt> {
  const rows = db
    .select({
      userId: quizAttempts.userId,
      quizId: quizAttempts.quizId,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
    })
    .from(quizAttempts)
    .where(
      and(
        inArray(quizAttempts.userId, userIds),
        inArray(quizAttempts.quizId, quizIds)
      )
    )
    .orderBy(desc(quizAttempts.score), asc(quizAttempts.id))
    .all();
  const best = new Map<string, BestAttempt>();
  for (const row of rows) {
    const key = attemptKey(row.userId, row.quizId);
    if (!best.has(key)) best.set(key, { score: row.score, passed: row.passed });
  }
  return best;
}

function attemptKey(userId: number, quizId: number) {
  return `${userId}:${quizId}`;
}

function percent(part: number, whole: number) {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

export function getCourseRoster(db: Db, courseId: number): CourseRoster {
  const courseLessons = getCourseLessons(db, courseId);
  const lessonIds = courseLessons.map((lesson) => lesson.id);
  const rosterQuizzes = getRosterQuizzes(db, courseLessons);
  const enrolled = getEnrolledStudents(db, courseId);
  const userIds = enrolled.map((student) => student.userId);
  const completedCounts = getCompletedLessonCounts(db, userIds, lessonIds);
  const bestAttempts = getBestAttempts(
    db,
    userIds,
    rosterQuizzes.map((quiz) => quiz.quizId)
  );

  const students = enrolled.map((student) => ({
    ...student,
    progress: percent(
      completedCounts.get(student.userId) ?? 0,
      lessonIds.length
    ),
    quizScores: rosterQuizzes.map((quiz) => {
      const attempt = bestAttempts.get(attemptKey(student.userId, quiz.quizId));
      return {
        ...quiz,
        bestScore: attempt?.score ?? null,
        passed: attempt?.passed ?? null,
      };
    }),
  }));

  return { students, quizCount: rosterQuizzes.length };
}
