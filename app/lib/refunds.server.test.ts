import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  RefundEventKind,
  RefundRequestStatus,
  RefundStatus,
  RevocationReason,
  UserRole,
} from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRules,
  createRefundRequest,
  declineRefundRequest,
  getRefundOffer,
  getRefundedLearnerIds,
  getLatestPurchase,
  hasOpenRefundRequest,
  markRefundFailed,
  markRefundIssued,
  retryRefund,
  RefundError,
} from "./refunds.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date("2026-11-09T12:00:00");

function daysBefore(days: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;

function addLessons(count: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "M1", position: 1 })
    .returning()
    .get();
  return Array.from({ length: count }, (_, i) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: `L${i}`, position: i + 1 })
      .returning()
      .get()
  );
}

function buy(opts: { daysAgo?: number; userId?: number; amount?: number } = {}) {
  const userId = opts.userId ?? base.user.id;
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: opts.amount ?? 7900,
      createdAt: daysBefore(opts.daysAgo ?? 1),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function buyForTeam(seats: number) {
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      createdAt: daysBefore(1),
    })
    .returning()
    .get();
  const team = db.insert(schema.teams).values({}).returning().get();
  for (let i = 0; i < seats; i++) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `CODE${i}`,
        purchaseId: purchase.id,
      })
      .run();
  }
  return purchase;
}

function enrollmentsFor(userId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .all();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  admin = db
    .insert(schema.users)
    .values({ name: "Ada", email: "ada@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

describe("refund rules", () => {
  it("offers the full amount paid within the window", () => {
    const purchase = buy({ daysAgo: 3 });
    const result = getRefundOffer(db, base.user.id, base.course.id, NOW);
    expect(result).toEqual({
      offer: {
        purchaseId: purchase.id,
        amount: 7900,
        lastDayInWindow: "2026-11-20",
        seatCount: 0,
      },
    });
  });

  it("closes after fourteen calendar days", () => {
    buy({ daysAgo: 15 });
    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toEqual({
      block: "window-closed",
    });
  });

  it("blocks a learner who has completed half the lessons", () => {
    const lessons = addLessons(4);
    buy();
    for (const lesson of lessons.slice(0, 2)) {
      db.insert(schema.lessonProgress)
        .values({
          userId: base.user.id,
          lessonId: lesson.id,
          status: schema.LessonProgressStatus.Completed,
        })
        .run();
    }
    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toEqual({
      block: "completed-too-much",
    });
  });

  it("counts watch time from earlier purchases too", () => {
    const [lesson] = addLessons(1);
    const first = buy({ daysAgo: 30 });
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 2 * 60 * 60,
      })
      .run();
    const request = createRefundRequest(db, {
      purchaseId: first.id,
      reason: "Not for me after all",
    });
    approveRefundRequest(db, { refundRequestId: request.id, adminId: admin.id });

    buy({ daysAgo: 1 });
    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toEqual({
      block: "watched-too-much",
    });
  });

  it("blocks a second request while one is open", () => {
    const purchase = buy();
    createRefundRequest(db, { purchaseId: purchase.id, reason: "Wrong course" });
    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toEqual({
      block: "open-request",
    });
  });

  it("lets the learner ask again after a decline", () => {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    declineRefundRequest(db, {
      refundRequestId: request.id,
      adminId: admin.id,
      decisionNote: "It is the right course.",
    });
    expect(getRefundOffer(db, base.user.id, base.course.id, NOW)).toHaveProperty(
      "offer"
    );
  });

  it("blocks a team purchase once a Seat is claimed", () => {
    const purchase = buyForTeam(3);
    db.update(schema.coupons)
      .set({ redeemedAt: NOW.toISOString(), redeemedByUserId: admin.id })
      .where(eq(schema.coupons.code, "CODE0"))
      .run();
    expect(checkRefundRules(db, purchase, NOW).blocks).toContain("seat-claimed");
  });
});

describe("approving a Refund Request", () => {
  it("creates a Pending Refund and revokes the learner's Enrollment", () => {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });

    const result = approveRefundRequest(db, {
      refundRequestId: request.id,
      adminId: admin.id,
      decisionNote: "  ",
    });

    expect(result.request.status).toBe(RefundRequestStatus.Approved);
    expect(result.request.decisionNote).toBeNull();
    expect(result.request.decidedByUserId).toBe(admin.id);
    expect(result.refund).toMatchObject({
      amount: 7900,
      status: RefundStatus.Pending,
    });
    const [enrollment] = enrollmentsFor(base.user.id);
    expect(enrollment.revokedAt).not.toBeNull();
    expect(enrollment.revocationReason).toBe(RevocationReason.Refunded);
    expect(result.email.body).toContain("no longer have access");
  });

  it("voids every unclaimed Seat on a team purchase", () => {
    const purchase = buyForTeam(3);
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Team changed plans",
    });
    expect(hasOpenRefundRequest(db, purchase.id)).toBe(true);

    approveRefundRequest(db, { refundRequestId: request.id, adminId: admin.id });

    const seats = db.select().from(schema.coupons).all();
    expect(seats.every((seat) => seat.voidedAt !== null)).toBe(true);
    expect(hasOpenRefundRequest(db, purchase.id)).toBe(false);
  });

  it("refuses a request another Admin already decided", () => {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    approveRefundRequest(db, { refundRequestId: request.id, adminId: admin.id });

    expect(() =>
      declineRefundRequest(db, {
        refundRequestId: request.id,
        adminId: admin.id,
        decisionNote: "No",
      })
    ).toThrow(RefundError);
    expect(db.select().from(schema.refunds).all()).toHaveLength(1);
  });

  it("lets the learner buy again with a fresh Enrollment, keeping the old one", () => {
    const purchase = buy({ daysAgo: 5 });
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    approveRefundRequest(db, { refundRequestId: request.id, adminId: admin.id });
    expect(getRefundedLearnerIds(db, base.course.id, [base.user.id])).toEqual(
      new Set([base.user.id])
    );

    const second = buy({ daysAgo: 1 });

    expect(enrollmentsFor(base.user.id)).toHaveLength(2);
    expect(getLatestPurchase(db, base.user.id, base.course.id)?.id).toBe(
      second.id
    );
    expect(getRefundedLearnerIds(db, base.course.id, [base.user.id]).size).toBe(
      0
    );
  });
});

describe("declining a Refund Request", () => {
  it("requires a Decision Note", () => {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    expect(() =>
      declineRefundRequest(db, {
        refundRequestId: request.id,
        adminId: admin.id,
        decisionNote: " ",
      })
    ).toThrow(/why/);
  });

  it("keeps the learner's access and creates no Refund", () => {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    const result = declineRefundRequest(db, {
      refundRequestId: request.id,
      adminId: admin.id,
      decisionNote: "You've watched most of it.",
    });
    expect(result.email.body).toContain("You've watched most of it.");
    expect(enrollmentsFor(base.user.id)[0].revokedAt).toBeNull();
    expect(db.select().from(schema.refunds).all()).toHaveLength(0);
  });
});

describe("moving a Refund", () => {
  function approved() {
    const purchase = buy();
    const request = createRefundRequest(db, {
      purchaseId: purchase.id,
      reason: "Wrong course",
    });
    return approveRefundRequest(db, {
      refundRequestId: request.id,
      adminId: admin.id,
    }).refund;
  }

  it("marks a Pending Refund issued and emails the learner", () => {
    const refund = approved();
    const result = markRefundIssued(db, { refundId: refund.id, adminId: admin.id });
    expect(result.refund.status).toBe(RefundStatus.Issued);
    expect(result.refund.issuedAt).not.toBeNull();
    expect(result.email.subject).toContain("Refund sent");
  });

  it("fails with a required note, then retries back to Pending", () => {
    const refund = approved();
    expect(() =>
      markRefundFailed(db, { refundId: refund.id, adminId: admin.id, note: "" })
    ).toThrow(RefundError);

    markRefundFailed(db, {
      refundId: refund.id,
      adminId: admin.id,
      note: "Card expired",
    });
    const retried = retryRefund(db, { refundId: refund.id, adminId: admin.id });
    expect(retried.status).toBe(RefundStatus.Pending);

    const events = db.select().from(schema.refundEvents).all();
    expect(events.map((e) => [e.kind, e.note])).toEqual([
      [RefundEventKind.Failed, "Card expired"],
      [RefundEventKind.Retried, null],
    ]);
  });

  it("won't issue a Refund that has failed", () => {
    const refund = approved();
    markRefundFailed(db, { refundId: refund.id, adminId: admin.id, note: "x" });
    expect(() =>
      markRefundIssued(db, { refundId: refund.id, adminId: admin.id })
    ).toThrow(/no longer pending/);
  });
});
