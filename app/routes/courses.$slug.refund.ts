import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { courses, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import {
  buildRefundRequestedEmail,
  createRefundRequest,
  getRefundOffer,
  REFUND_BLOCK_MESSAGES,
  sendEmail,
} from "~/lib/refunds.server";

const refundParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundParamsSchema);
  const course = db.select().from(courses).where(eq(courses.slug, slug)).get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  // The same rules the course page and team page use to show the form.
  const result = getRefundOffer(db, currentUserId, course.id);

  if ("block" in result) {
    if (result.block === "no-purchase") {
      throw data("You have not bought this course.", { status: 403 });
    }
    throw data(REFUND_BLOCK_MESSAGES[result.block], {
      status: result.block === "open-request" ? 409 : 403,
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  createRefundRequest(db, {
    purchaseId: result.offer.purchaseId,
    reason: parsed.data.reason,
  });

  sendEmail(
    buildRefundRequestedEmail({
      learnerName: learner.name,
      learnerEmail: learner.email,
      courseTitle: course.title,
      amount: result.offer.amount,
      seatCount: result.offer.seatCount,
    })
  );

  const redirectTo = formData.get("redirectTo");
  return redirect(
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? redirectTo
      : "/settings"
  );
}
