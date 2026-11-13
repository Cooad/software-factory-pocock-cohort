import { eq } from "drizzle-orm";
import { coupons, enrollments, purchases } from "~/db/schema";
import {
  ALREADY_ENROLLED,
  createEnrollment,
  isEnrolled,
} from "~/lib/enrollments.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seat claim service ───
// A Student claiming a Seat on a Team Licence, which gives them an Enrollment.
// Takes the database and `now` so tests can hand in an in-memory database and
// a fixed clock.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

type Seat = typeof coupons.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

export type ClaimSeatResult =
  | { ok: true; seat: Seat; enrollment: Enrollment }
  | { ok: false; error: string };

export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): ClaimSeatResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  if (isEnrolled(db, userId, seat.courseId)) {
    return { ok: false, error: ALREADY_ENROLLED };
  }

  // A Seat can only be claimed from the country the Team Licence was bought in
  // (ADR 0009), unless that country is unknown.
  const licence = db
    .select({ country: purchases.country })
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (licence?.country && licence.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  const enrolled = createEnrollment(db, userId, seat.courseId, now);
  if (!enrolled.ok) return enrolled;

  const claimed = db
    .update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
    .where(eq(coupons.id, seat.id))
    .returning()
    .get();

  return { ok: true, seat: claimed, enrollment: enrolled.enrollment };
}
