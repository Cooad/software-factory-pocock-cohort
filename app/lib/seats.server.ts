import { and, eq, isNull } from "drizzle-orm";
// The table is still called `coupons`; in Cadence's language each row is a Seat.
import {
  coupons as seats,
  courses,
  enrollments,
  purchases,
  users,
} from "~/db/schema";
import {
  ALREADY_ENROLLED,
  createEnrollment,
  isEnrolled,
} from "~/lib/enrollments.server";
import {
  notifySafely,
  type NotificationPerson,
  type Notifier,
} from "~/lib/notifications.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seat claim service ───
// A Student claiming a Seat on a Team Licence, which gives them an Enrollment.
// Takes the database first and `now` last so tests can hand in an in-memory
// database and a fixed clock, and the `Notifier` port second. Notifications are
// sent after the claim is written and never fail it.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

type Seat = typeof seats.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

export type ClaimSeatResult =
  | { ok: true; seat: Seat; enrollment: Enrollment }
  | { ok: false; error: string };

function getPerson(db: Db, userId: number): NotificationPerson | undefined {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}

/** Seats on the Team Licence that are neither claimed nor refunded. */
function countSeatsLeft(db: Db, purchaseId: number): number {
  return db
    .select({ id: seats.id })
    .from(seats)
    .where(
      and(
        eq(seats.purchaseId, purchaseId),
        isNull(seats.redeemedAt),
        isNull(seats.refundedAt)
      )
    )
    .all().length;
}

/**
 * Notification 4: tells the Team Admin who owns the Team Licence that one of
 * its Seats was claimed, and how many are left. One per claim.
 */
async function notifySeatClaimed(db: Db, notifier: Notifier, seat: Seat) {
  const licence = db
    .select({ buyerId: purchases.userId })
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  const course = db
    .select({ slug: courses.slug, title: courses.title })
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!licence || !course || seat.redeemedByUserId === null) return;

  const recipient = getPerson(db, licence.buyerId);
  const actor = getPerson(db, seat.redeemedByUserId);
  if (!recipient || !actor) return;

  await notifySafely(notifier, {
    kind: "seat-claimed",
    recipients: [recipient],
    actor,
    data: {
      seatId: seat.id,
      purchaseId: seat.purchaseId,
      courseSlug: course.slug,
      courseTitle: course.title,
      seatsLeft: countSeatsLeft(db, seat.purchaseId),
    },
    idempotencyKey: `seat-claimed:${seat.id}`,
  });
}

/**
 * Claims a Seat for a Student, enrolling them in its course. Notifies the Team
 * Admin who owns the Team Licence.
 */
export async function claimSeat(
  db: Db,
  notifier: Notifier,
  /** The code in the Seat's claim link (`/redeem/:code`). */
  seatCode: string,
  userId: number,
  userCountry: string,
  now: Date
): Promise<ClaimSeatResult> {
  const seat = db.select().from(seats).where(eq(seats.code, seatCode)).get();
  if (!seat) {
    return { ok: false, error: "Seat not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "This Seat has already been claimed" };
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
        "This Seat can only be claimed from the country its Team Licence was bought in",
    };
  }

  const enrolled = await createEnrollment(
    db,
    notifier,
    userId,
    seat.courseId,
    now
  );
  if (!enrolled.ok) return enrolled;

  const claimed = db
    .update(seats)
    .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
    .where(eq(seats.id, seat.id))
    .returning()
    .get();

  await notifySeatClaimed(db, notifier, claimed);

  return { ok: true, seat: claimed, enrollment: enrolled.enrollment };
}
