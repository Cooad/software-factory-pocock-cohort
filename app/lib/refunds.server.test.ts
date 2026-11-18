import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createTestDb,
  createUserWithRole,
  seedBaseData,
} from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRequest,
  declineRefundRequest,
  getRefundOffer,
  getSeatAvailability,
  listRefundRequestsForBuyer,
  listRefundRequestsForReview,
  listTeamLicences,
  raiseRefundRequest,
} from "./refunds.server";
import { isBookmarked, toggleBookmark } from "./bookmarks.server";
import { getNote, saveNote } from "./notes.server";
import { createLesson, createModule } from "./course-content.server";
import { createStudent } from "./users.server";
import { enrollStudent, isEnrolled } from "./enrollments.server";
import {
  createIndividualPurchase,
  createTeamLicence,
} from "./purchases.server";
import { claimSeat, getSeatByCode } from "./seat-claims.server";
import { getLessonProgress, markLessonComplete } from "./lesson-progress.server";
import { recordVideoWatchEvent } from "./video-tracking.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;
type Seat = typeof schema.coupons.$inferSelect;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when;
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;
let lessonIds: number[];
let notifications: FakeNotifications;

beforeEach(() => {
  db = createTestDb();
  notifications = fakeNotifications();
  base = seedBaseData(db);

  platformAdmin = createUserWithRole(
    db,
    "Pat Admin",
    "pat@example.com",
    UserRole.Admin
  );

  const module = createModule(db, base.course.id, "Basics");
  lessonIds = [1, 2, 3, 4].map(
    (n) => createLesson(db, module.id, `Lesson ${n}`).id
  );
});

async function buyForSelf(userId: number, daysAgo = 3, amountPaid = 7900) {
  const purchase = createIndividualPurchase(
    db,
    userId,
    base.course.id,
    amountPaid,
    null,
    daysBefore(daysAgo)
  );
  await enrollStudent(
    db,
    userId,
    base.course.id,
    daysBefore(daysAgo),
    fakeNotifications()
  );
  return purchase;
}

function buySeats(userId: number, seats: number, daysAgo = 3) {
  return createTeamLicence(
    db,
    userId,
    base.course.id,
    7900 * seats,
    null,
    seats,
    daysBefore(daysAgo)
  );
}

async function claim(seat: Seat, studentId: number) {
  const result = await claimSeat(
    db,
    seat.code,
    studentId,
    "GB",
    daysBefore(1),
    fakeNotifications()
  );
  if (!result.ok) throw new Error(result.error);
}

async function raise(purchaseId: number, buyerId: number) {
  const result = await raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It was not what I expected.",
    NOW,
    notifications
  );
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function availabilityOf(seat: Seat) {
  const current = getSeatByCode(db, seat.code);
  if (!current) throw new Error("Seat not found");
  return getSeatAvailability(db, current);
}

describe("raising a Refund Request", () => {
  it("lets the buyer raise one on an Individual Purchase inside the window", async () => {
    const purchase = await buyForSelf(base.user.id);

    const result = await raiseRefundRequest(db, purchase.id, base.user.id, "Nope.", NOW, notifications);

    expect(result).toMatchObject({ ok: true, kind: "individual_purchase" });
  });

  it("refuses anyone but the buyer", async () => {
    const purchase = await buyForSelf(base.user.id);
    const someoneElse = createStudent(db, "Ben", "ben@example.com");

    expect(checkRefundRequest(db, purchase.id, someoneElse.id, NOW)).toMatchObject(
      { ok: false, status: 404 }
    );
  });

  it("allows only one Open Refund Request per Purchase", async () => {
    const purchase = await buyForSelf(base.user.id);
    await raise(purchase.id, base.user.id);

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 409 }
    );
  });

  it("keeps the fourteenth day open and closes the fifteenth", async () => {
    const onDay14 = await buyForSelf(base.user.id, 14);
    const onDay15 = await buyForSelf(createStudent(db, "Ben", "ben@example.com").id, 15);

    expect(checkRefundRequest(db, onDay14.id, onDay14.userId, NOW).ok).toBe(true);
    expect(
      checkRefundRequest(db, onDay15.id, onDay15.userId, NOW)
    ).toMatchObject({ ok: false, error: "The 14-day window has closed." });
  });

  it("refuses a buyer who has completed half the lessons", async () => {
    const purchase = await buyForSelf(base.user.id);
    for (const lessonId of lessonIds.slice(0, 2)) {
      markLessonComplete(db, base.user.id, lessonId, NOW);
    }

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a buyer who has watched two hours", async () => {
    const purchase = await buyForSelf(base.user.id);
    recordVideoWatchEvent(db, base.user.id, lessonIds[0], "progress", 3600);
    recordVideoWatchEvent(db, base.user.id, lessonIds[1], "progress", 3600);

    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW)).toMatchObject(
      { ok: false, status: 403 }
    );
  });

  it("refuses a Team Licence with a Claimed Seat", async () => {
    const teamAdmin = createStudent(db, "Priya", "priya@example.com");
    const { purchase, seats } = buySeats(teamAdmin.id, 3);
    await claim(seats[0], createStudent(db, "Ben", "ben@example.com").id);

    expect(checkRefundRequest(db, purchase.id, teamAdmin.id, NOW)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("the refund offer on the course page", () => {
  it("offers the newest Individual Purchase, not a newer Team Licence", async () => {
    const individual = await buyForSelf(base.user.id, 3);
    buySeats(base.user.id, 5, 1);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toMatchObject({
      purchaseId: individual.id,
      amount: 7900,
    });
  });

  it("offers nothing once the purchase has been refunded", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toBeNull();
  });
});

describe("approving a Refund Request", () => {
  it("removes the buyer's Enrollment but keeps their progress", async () => {
    const purchase = await buyForSelf(base.user.id);
    markLessonComplete(db, base.user.id, lessonIds[0], NOW);
    const id = await raise(purchase.id, base.user.id);

    const result = await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(result.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
    expect(getLessonProgress(db, base.user.id, lessonIds[0])?.status).toBe(
      LessonProgressStatus.Completed
    );
    expect(
      listRefundRequestsForReview(db, RefundStatus.Approved, NOW)
    ).toMatchObject([
      { id, status: RefundStatus.Approved, decidedByName: "Pat Admin" },
    ]);
  });

  it("keeps the buyer's Bookmarks and Notes", async () => {
    const purchase = await buyForSelf(base.user.id);
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[1], "Come back to this", NOW);
    const id = await raise(purchase.id, base.user.id);

    const result = await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(result.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[1])?.body).toBe("Come back to this");
  });

  it("keeps the buyer's Enrollment if they also hold a Claimed Seat for the course", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { seats } = buySeats(priya.id, 2);
    // Liam claims a Seat first, so his Enrollment came from it.
    await claim(seats[0], base.user.id);
    const purchase = createIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      daysBefore(2)
    );
    const id = await raise(purchase.id, base.user.id);

    await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("makes a Team Licence's Unclaimed Seats unclaimable", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { purchase, seats } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    const result = await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(result.ok).toBe(true);
    for (const seat of seats) {
      expect(availabilityOf(seat)).toBe("refunded");
    }
  });

  it("lets the first decision win", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(
      await declineRefundRequest(db, id, platformAdmin.id, "Too late.", NOW, notifications)
    ).toMatchObject({
      ok: false,
      status: 409,
      error: "This refund request was already approved.",
    });
  });

  it("emails the buyer that the refund is on its way", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    const result = await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    if (!result.ok) throw new Error(result.error);
    expect(result.email.to).toBe("test@example.com");
    expect(result.email.subject).toBe("Refund approved — Test Course");
    expect(result.email.body).toContain("$79.00");
  });
});

describe("declining a Refund Request", () => {
  it("needs a note", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    expect(await declineRefundRequest(db, id, platformAdmin.id, "  ", NOW, notifications)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("keeps the buyer's Enrollment and lets them raise a new Refund Request", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);

    const result = await declineRefundRequest(
      db,
      id,
      platformAdmin.id,
      "You finished the course.",
      NOW,
      notifications
    );

    if (!result.ok) throw new Error(result.error);
    expect(result.email.body).toContain("You finished the course.");
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(checkRefundRequest(db, purchase.id, base.user.id, NOW).ok).toBe(true);
  });

  it("frees a Team Licence's Seats again", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { purchase, seats } = buySeats(priya.id, 1);
    const id = await raise(purchase.id, priya.id);
    expect(availabilityOf(seats[0])).toBe("on_hold");

    await declineRefundRequest(db, id, platformAdmin.id, "Seats are in use.", NOW, notifications);

    expect(availabilityOf(seats[0])).toBe("available");
  });
});

describe("listing Refund Requests", () => {
  it("shows a Platform Admin live figures and the rules a request breaks", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    // Since raising the request, the buyer has finished half the course.
    for (const lessonId of lessonIds.slice(0, 2)) {
      markLessonComplete(db, base.user.id, lessonId, NOW);
    }

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row).toMatchObject({
      id,
      buyerName: "Test User",
      daysSincePurchase: 3,
      figures: {
        kind: "individual_purchase",
        lessonsCompleted: 2,
        lessonCount: 4,
      },
      ruleBreaks: ["completed_too_much"],
      canApprove: true,
    });
  });

  it("shows a Team Licence's Seats instead of the buyer's progress", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { purchase } = buySeats(priya.id, 3);
    await raise(purchase.id, priya.id);

    const [row] = listRefundRequestsForReview(db, RefundStatus.Open, NOW);

    expect(row.figures).toEqual({
      kind: "team_licence",
      seatCount: 3,
      claimedSeatCount: 0,
    });
  });

  it("lists only the requested status, oldest first", async () => {
    const first = await buyForSelf(base.user.id);
    const ben = createStudent(db, "Ben", "ben@example.com");
    const second = await buyForSelf(ben.id);
    const firstId = await raise(first.id, base.user.id);
    const secondId = await raiseRefundRequest(
      db,
      second.id,
      ben.id,
      "Changed my mind.",
      new Date(NOW.getTime() + 60_000),
      notifications
    );
    if (!secondId.ok) throw new Error(secondId.error);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Open, NOW).map((r) => r.id)
    ).toEqual([firstId, secondId.refundRequestId]);

    await approveRefundRequest(db, firstId, platformAdmin.id, null, NOW, notifications);

    expect(
      listRefundRequestsForReview(db, RefundStatus.Approved, NOW)
    ).toMatchObject([{ id: firstId, decidedByName: "Pat Admin" }]);
  });

  it("shows a buyer their decided requests with the decline note", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await declineRefundRequest(db, id, platformAdmin.id, "Past half way.", NOW, notifications);

    expect(listRefundRequestsForBuyer(db, base.user.id)).toMatchObject([
      { id, status: RefundStatus.Declined, decisionNote: "Past half way." },
    ]);
  });

  it("lists a Team Admin's Team Licences and whether each can be refunded", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    buySeats(priya.id, 2);
    const { seats } = buySeats(priya.id, 2);
    await claim(seats[0], createStudent(db, "Ben", "ben@example.com").id);

    expect(listTeamLicences(db, priya.id, NOW)).toMatchObject([
      { seatCount: 2, claimedSeatCount: 1, canRequestRefund: false },
      { seatCount: 2, claimedSeatCount: 0, canRequestRefund: true },
    ]);
  });
});

describe("the Refund Request Notifications", () => {
  const testUser = {
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
  };

  function sentOf(kind: string) {
    return notifications.sent.filter((n) => n.kind === kind);
  }

  it("confirms the Refund Request to the buyer", async () => {
    const purchase = await buyForSelf(base.user.id, 3, 7900);

    const id = await raise(purchase.id, base.user.id);

    expect(sentOf("refund-requested")).toEqual([
      {
        kind: "refund-requested",
        idempotencyKey: `refund-requested:${id}`,
        recipient: { id: base.user.id, ...testUser },
        data: { refundRequestId: id, courseTitle: "Test Course", amount: "$79.00" },
      },
    ]);
  });

  it("tells every Platform Admin, and nobody else, about the Open Refund Request", async () => {
    const sam = createUserWithRole(
      db,
      "Sam Admin",
      "sam@example.com",
      UserRole.Admin
    );
    const purchase = await buyForSelf(base.user.id, 3, 7900);

    const id = await raise(purchase.id, base.user.id);

    const open = sentOf("refund-request-open");
    expect(open.map((n) => n.recipient.id).sort()).toEqual(
      [platformAdmin.id, sam.id].sort()
    );
    expect(open[0]).toEqual({
      kind: "refund-request-open",
      idempotencyKey: `refund-request-open:${id}`,
      recipient: {
        id: platformAdmin.id,
        name: "Pat Admin",
        email: "pat@example.com",
        avatarUrl: null,
      },
      actor: { id: base.user.id, ...testUser },
      data: {
        refundRequestId: id,
        buyerName: "Test User",
        courseTitle: "Test Course",
        amount: "$79.00",
        reason: "It was not what I expected.",
        url: "/admin/refunds",
      },
    });
  });

  it("tells the buyer their Individual Purchase refund was approved", async () => {
    const purchase = await buyForSelf(base.user.id, 3, 7900);
    const id = await raise(purchase.id, base.user.id);

    await approveRefundRequest(db, id, platformAdmin.id, "Sorry it didn't work out.", NOW, notifications);

    expect(sentOf("refund-approved")).toEqual([
      {
        kind: "refund-approved",
        idempotencyKey: `refund-approved:${id}`,
        recipient: { id: base.user.id, ...testUser },
        actor: {
          id: platformAdmin.id,
          name: "Pat Admin",
          email: "pat@example.com",
          avatarUrl: null,
        },
        data: {
          refundRequestId: id,
          courseTitle: "Test Course",
          purchaseKind: "individual_purchase",
          amount: "$79.00",
          decisionNote: "Sorry it didn't work out.",
          url: "/settings",
        },
      },
    ]);
  });

  it("tells a Team Admin their Team Licence refund was declined", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { purchase } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    await declineRefundRequest(db, id, platformAdmin.id, "  Seats are in use.  ", NOW, notifications);

    expect(sentOf("refund-declined")).toEqual([
      {
        kind: "refund-declined",
        idempotencyKey: `refund-declined:${id}`,
        recipient: {
          id: priya.id,
          name: "Priya",
          email: "priya@example.com",
          avatarUrl: null,
        },
        actor: {
          id: platformAdmin.id,
          name: "Pat Admin",
          email: "pat@example.com",
          avatarUrl: null,
        },
        data: {
          refundRequestId: id,
          courseTitle: "Test Course",
          purchaseKind: "team_licence",
          amount: "$158.00",
          decisionNote: "Seats are in use.",
          url: "/team",
        },
      },
    ]);
    expect(sentOf("refund-approved")).toEqual([]);
  });

  it("tells a Team Admin their Team Licence refund was approved, with no note", async () => {
    const priya = createStudent(db, "Priya", "priya@example.com");
    const { purchase } = buySeats(priya.id, 2);
    const id = await raise(purchase.id, priya.id);

    await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);

    expect(sentOf("refund-approved")).toMatchObject([
      {
        idempotencyKey: `refund-approved:${id}`,
        recipient: { id: priya.id },
        data: { purchaseKind: "team_licence", decisionNote: null, url: "/team" },
      },
    ]);
  });

  it("still raises and decides Refund Requests, with their emails, when Knock is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));
    const purchase = await buyForSelf(base.user.id);

    const raised = await raiseRefundRequest(db, purchase.id, base.user.id, "Nope.", NOW, notifications);
    if (!raised.ok) throw new Error(raised.error);
    const declined = await declineRefundRequest(db, raised.refundRequestId, platformAdmin.id, "No.", NOW, notifications);

    expect(raised.email.to).toBe("test@example.com");
    expect(declined).toMatchObject({ ok: true, email: { to: "test@example.com" } });
    for (const key of ["refund-requested:", "refund-request-open:", "refund-declined:"]) {
      expect(error).toHaveBeenCalledWith(expect.stringContaining(key), "Knock is down");
    }
    error.mockRestore();
  });

  it("sends nothing when a decision is refused", async () => {
    const purchase = await buyForSelf(base.user.id);
    const id = await raise(purchase.id, base.user.id);
    await approveRefundRequest(db, id, platformAdmin.id, null, NOW, notifications);
    notifications.sent.length = 0;

    await declineRefundRequest(db, id, platformAdmin.id, "Too late.", NOW, notifications);

    expect(notifications.sent).toEqual([]);
  });
});
