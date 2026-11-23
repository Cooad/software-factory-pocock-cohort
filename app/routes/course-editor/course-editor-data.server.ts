import { markdown } from "~/lib/text";
import { CourseStatus } from "~/db/schema";
import { db } from "~/db";
import { courses, categories, users, modules, lessons } from "~/db/schema";
import { eq, and, or, sql, gt, gte } from "drizzle-orm";

export function getCourseWithDetails(id: number) {
  const course = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      salesCopy: courses.salesCopy,
      instructorId: courses.instructorId,
      categoryId: courses.categoryId,
      status: courses.status,
      coverImageUrl: courses.coverImageUrl,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      instructorBio: users.bio,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .get();

  if (!course) return null;

  return { ...course, modules: getModulesWithLessons(id) };
}

function getModulesWithLessons(id: number) {
  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, id))
    .orderBy(modules.position)
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  const courseLessons =
    moduleIds.length > 0
      ? db
          .select()
          .from(lessons)
          .where(or(...moduleIds.map((mid) => eq(lessons.moduleId, mid))))
          .orderBy(lessons.position)
          .all()
      : [];

  return courseModules.map((mod) => ({
    ...mod,
    lessons: courseLessons.filter((l) => l.moduleId === mod.id),
  }));
}

export function getLessonCountForCourse(courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return 0;

  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .get();

  return count?.count ?? 0;
}

export function updateCourse(id: number, title: string, description: string) {
  return db
    .update(courses)
    .set({ title, description, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCourseStatus(id: number, status: CourseStatus) {
  return db
    .update(courses)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCourseSalesCopy(id: number, salesCopy: string) {
  if (salesCopy.trim().length === 0) {
    throw new Error("Sales copy cannot be empty");
  }

  return db
    .update(courses)
    .set({
      salesCopy: markdown(salesCopy),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCoursePrice(id: number, price: number) {
  return db
    .update(courses)
    .set({ price, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCoursePppEnabled(id: number, pppEnabled: boolean) {
  return db
    .update(courses)
    .set({ pppEnabled, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function getModuleById(id: number) {
  return db.select().from(modules).where(eq(modules.id, id)).get();
}

export function getModulesByCourse(courseId: number) {
  return db
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position)
    .all();
}

export function createModule(
  courseId: number,
  title: string,
  position: number | null
) {
  const pos =
    position ??
    (db
      .select({ max: sql<number>`coalesce(max(${modules.position}), 0)` })
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .get()?.max ?? 0) + 1;

  return db
    .insert(modules)
    .values({ courseId, title, position: pos })
    .returning()
    .get();
}

export function updateModuleTitle(id: number, title: string) {
  return db
    .update(modules)
    .set({ title })
    .where(eq(modules.id, id))
    .returning()
    .get();
}

export function deleteModule(id: number) {
  // Delete all lessons in this module first
  db.delete(lessons).where(eq(lessons.moduleId, id)).run();
  return db.delete(modules).where(eq(modules.id, id)).returning().get();
}

export function reorderModules(courseId: number, moduleIds: number[]) {
  for (let i = 0; i < moduleIds.length; i++) {
    db.update(modules)
      .set({ position: i + 1 })
      .where(and(eq(modules.id, moduleIds[i]), eq(modules.courseId, courseId)))
      .run();
  }
  return getModulesByCourse(courseId);
}

export function getLessonById(id: number) {
  return db.select().from(lessons).where(eq(lessons.id, id)).get();
}

export function getLessonsByModule(moduleId: number) {
  return db
    .select()
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId))
    .orderBy(lessons.position)
    .all();
}

export function createLesson(moduleId: number, title: string) {
  const pos =
    (db
      .select({ max: sql<number>`coalesce(max(${lessons.position}), 0)` })
      .from(lessons)
      .where(eq(lessons.moduleId, moduleId))
      .get()?.max ?? 0) + 1;

  return db
    .insert(lessons)
    .values({
      moduleId,
      title,
      position: pos,
    })
    .returning()
    .get();
}

export function updateLessonTitle(id: number, title: string) {
  return db
    .update(lessons)
    .set({ title })
    .where(eq(lessons.id, id))
    .returning()
    .get();
}

export function deleteLesson(id: number) {
  return db.delete(lessons).where(eq(lessons.id, id)).returning().get();
}

export function reorderLessons(moduleId: number, lessonIds: number[]) {
  for (let i = 0; i < lessonIds.length; i++) {
    db.update(lessons)
      .set({ position: i + 1 })
      .where(and(eq(lessons.id, lessonIds[i]), eq(lessons.moduleId, moduleId)))
      .run();
  }
  return getLessonsByModule(moduleId);
}

export function moveLessonToModule(
  lessonId: number,
  targetModuleId: number,
  targetPosition: number
) {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;

  const sourceModuleId = lesson.moduleId;

  // 1. Close the gap in the source module
  db.update(lessons)
    .set({ position: sql`${lessons.position} - 1` })
    .where(
      and(
        eq(lessons.moduleId, sourceModuleId),
        gt(lessons.position, lesson.position)
      )
    )
    .run();

  // 2. Open a gap in the destination module
  db.update(lessons)
    .set({ position: sql`${lessons.position} + 1` })
    .where(
      and(
        eq(lessons.moduleId, targetModuleId),
        gte(lessons.position, targetPosition)
      )
    )
    .run();

  // 3. Move the lesson to the target module at the target position
  return db
    .update(lessons)
    .set({ moduleId: targetModuleId, position: targetPosition })
    .where(eq(lessons.id, lessonId))
    .returning()
    .get();
}
