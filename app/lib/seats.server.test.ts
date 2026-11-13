import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { createFakeNotifier } from "./notifications.fake.server";
import { createEnrollment } from "./enrollments.server";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = addLearner("Tara");
  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

function addLearner(name: string) {
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

function buySeats(seats: number, country: string | null = "PL") {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdmin.id,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      country,
      createdAt: new Date(2026, 9, 3).toISOString(),
    })
    .returning()
    .get();
  const seatRows = Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats: seatRows };
}

async function raiseRefund(purchaseId: number) {
  const result = await raiseRefundRequest(db, createFakeNotifier(), purchaseId, teamAdmin.id, "Wrong course.", NOW);
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

describe("claiming a Seat", () => {
  it("enrolls the Student and records the claim", () => {
    const { seats } = buySeats(2);

    const result = claimSeat(db, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toMatchObject({
      ok: true,
      seat: {
        id: seats[0].id,
        redeemedByUserId: base.user.id,
        redeemedAt: NOW.toISOString(),
      },
      enrollment: {
        userId: base.user.id,
        courseId: base.course.id,
        enrolledAt: NOW.toISOString(),
      },
    });
  });

  it("refuses a Seat that has already been claimed", () => {
    const { seats } = buySeats(2);
    claimSeat(db, seats[0].code, base.user.id, "PL", NOW);

    const result = claimSeat(db, seats[0].code, addLearner("Ben").id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses an Unclaimed Seat while its Team Licence has an Open Refund Request", async () => {
    const { purchase, seats } = buySeats(2);
    await raiseRefund(purchase.id);

    const result = claimSeat(db, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });

  it("refuses an Unclaimed Seat once its Refund Request has been approved", async () => {
    const { purchase, seats } = buySeats(2);
    const refundRequestId = await raiseRefund(purchase.id);
    const approved = await approveRefundRequest(db, createFakeNotifier(), refundRequestId, platformAdmin.id, null, NOW);
    if (!approved.ok) throw new Error(approved.error);

    const result = claimSeat(db, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
  });

  it("refuses a Student in a different country from the buyer", () => {
    const { seats } = buySeats(2, "PL");

    const result = claimSeat(db, seats[0].code, base.user.id, "DE", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
  });

  it("lets a Student in any country claim when the buyer's country is unknown", () => {
    const { seats } = buySeats(2, null);

    const result = claimSeat(db, seats[0].code, base.user.id, "DE", NOW);

    expect(result.ok).toBe(true);
  });

  it("refuses a Student who is already enrolled, leaving the Seat unclaimed", () => {
    const { seats } = buySeats(2);
    createEnrollment(db, base.user.id, base.course.id, NOW);

    const refused = claimSeat(db, seats[0].code, base.user.id, "PL", NOW);
    const claimedByAnother = claimSeat(db, seats[0].code, addLearner("Ben").id, "PL", NOW);

    expect(refused).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(claimedByAnother.ok).toBe(true);
  });

  it("tells an already-enrolled Student so, even from another country", () => {
    const { seats } = buySeats(2, "PL");
    createEnrollment(db, base.user.id, base.course.id, NOW);

    const result = claimSeat(db, seats[0].code, base.user.id, "DE", NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("refuses a code that isn't a Seat", () => {
    expect(claimSeat(db, "NOPE", base.user.id, "PL", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });
});
