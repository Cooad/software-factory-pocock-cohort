import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { createEnrollment } from "./enrollments.server";
import { claimSeat } from "./seats.server";
import { createFakeNotifier, type FakeNotifier } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let notifier: FakeNotifier;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  notifier = createFakeNotifier();
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

/** A claim also enrolls, which sends New Enrollment; these tests are about Seats. */
function seatClaimedTriggers() {
  return notifier.triggers.filter((t) => t.kind === "seat-claimed");
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
  const result = await raiseRefundRequest(db, notifier, purchaseId, teamAdmin.id, "Wrong course.", NOW);
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

describe("claiming a Seat", () => {
  it("enrolls the Student and records the claim", async () => {
    const { seats } = buySeats(2);

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

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

  it("refuses a Seat that has already been claimed", async () => {
    const { seats } = buySeats(2);
    await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

    const result = await claimSeat(db, notifier, seats[0].code, addLearner("Ben").id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error: "This Seat has already been claimed",
    });
  });

  it("refuses an Unclaimed Seat while its Team Licence has an Open Refund Request", async () => {
    const { purchase, seats } = buySeats(2);
    await raiseRefund(purchase.id);

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });

  it("refuses an Unclaimed Seat once its Refund Request has been approved", async () => {
    const { purchase, seats } = buySeats(2);
    const refundRequestId = await raiseRefund(purchase.id);
    const approved = await approveRefundRequest(db, notifier, refundRequestId, platformAdmin.id, null, NOW);
    if (!approved.ok) throw new Error(approved.error);

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
  });

  it("refuses a Student in a different country from the buyer", async () => {
    const { seats } = buySeats(2, "PL");

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "DE", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This Seat can only be claimed from the country its Team Licence was bought in",
    });
  });

  it("lets a Student in any country claim when the buyer's country is unknown", async () => {
    const { seats } = buySeats(2, null);

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "DE", NOW);

    expect(result.ok).toBe(true);
  });

  it("refuses a Student who is already enrolled, leaving the Seat unclaimed", async () => {
    const { seats } = buySeats(2);
    await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    const refused = await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);
    const claimedByAnother = await claimSeat(db, notifier, seats[0].code, addLearner("Ben").id, "PL", NOW);

    expect(refused).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(claimedByAnother.ok).toBe(true);
  });

  it("tells an already-enrolled Student so, even from another country", async () => {
    const { seats } = buySeats(2, "PL");
    await createEnrollment(db, notifier, base.user.id, base.course.id, NOW);

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "DE", NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("refuses a code that isn't a Seat", async () => {
    expect(await claimSeat(db, notifier, "NOPE", base.user.id, "PL", NOW)).toEqual({
      ok: false,
      error: "Seat not found",
    });
  });
});

describe("claiming a Seat: the Seat claimed Notification", () => {
  it("tells the Team Admin who claimed it, which course and how many Seats are left", async () => {
    const { purchase, seats } = buySeats(3);

    await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

    expect(seatClaimedTriggers()).toEqual([
      {
        kind: "seat-claimed",
        recipients: [
          {
            id: teamAdmin.id,
            name: "Tara",
            email: "tara@example.com",
            avatarUrl: null,
          },
        ],
        actor: {
          id: base.user.id,
          name: base.user.name,
          email: base.user.email,
          avatarUrl: base.user.avatarUrl,
        },
        data: {
          seatId: seats[0].id,
          purchaseId: purchase.id,
          courseSlug: base.course.slug,
          courseTitle: base.course.title,
          seatsLeft: 2,
        },
        idempotencyKey: `seat-claimed:${seats[0].id}`,
      },
    ]);
  });

  it("counts down to no Seats left, one Notification per claim", async () => {
    const { seats } = buySeats(2);

    await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);
    await claimSeat(db, notifier, seats[1].code, addLearner("Ben").id, "PL", NOW);

    expect(
      seatClaimedTriggers().map((t) => [t.idempotencyKey, t.data])
    ).toMatchObject([
      [`seat-claimed:${seats[0].id}`, { seatsLeft: 1 }],
      [`seat-claimed:${seats[1].id}`, { seatsLeft: 0 }],
    ]);
  });

  it("still claims the Seat when Notifications fail", async () => {
    const { seats } = buySeats(2);
    notifier.failWith(new Error("Knock is down"));

    const result = await claimSeat(db, notifier, seats[0].code, base.user.id, "PL", NOW);

    expect(result).toMatchObject({
      ok: true,
      seat: { id: seats[0].id, redeemedByUserId: base.user.id },
    });
  });

  it("notifies nobody when the claim is refused", async () => {
    const { seats } = buySeats(2, "PL");

    await claimSeat(db, notifier, seats[0].code, base.user.id, "DE", NOW);

    expect(notifier.triggers).toEqual([]);
  });
});
