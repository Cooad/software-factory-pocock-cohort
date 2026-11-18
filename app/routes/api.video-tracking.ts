import { data } from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.video-tracking";
import {
  requireContentAccess,
  requireUserId,
} from "~/modules/course-access/request.server";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { lessons, modules, videoWatchEvents } from "~/db/schema";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

function getLessonCourseId(lessonId: number): number | undefined {
  return db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get()?.courseId;
}

export async function action({ request }: Route.ActionArgs) {
  // Signed-out callers get 401 before anything about the body or lesson.
  await requireUserId(request);

  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  const courseId = getLessonCourseId(lessonId);
  if (courseId === undefined) {
    throw data("Lesson not found", { status: 404 });
  }

  // Same cached viewer as above: the request is read once.
  const { userId } = await requireContentAccess(request, courseId);

  db.insert(videoWatchEvents)
    .values({
      userId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .run();

  return { success: true };
}
