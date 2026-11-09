import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refundEvents,
  refundRequests,
  refunds,
  users,
  videoWatchEvents,
  LessonProgressStatus,
  RefundEventKind,
  RefundRequestStatus,
  RefundStatus,
  RevocationReason,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";

// Refund Requests and Refunds. The words used here are defined in GLOSSARY.md.
// Every function takes the database as its first argument so tests can hand
// in an isolated in-memory one.

export type Db = BetterSQLite3Database<typeof schema>;
/** A database or an open transaction — anything that can run queries. */
type Queryable = Pick<Db, "select" | "insert" | "update">;

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** The condition every "does this learner have access?" query must include. */
export const isActiveEnrollment = isNull(enrollments.revokedAt);

// ─── Errors ───

export type RefundErrorCode =
  | "not-found"
  | "already-decided"
  | "note-required"
  | "wrong-refund-state";

export class RefundError extends Error {
  constructor(
    public code: RefundErrorCode,
    message: string
  ) {
    super(message);
  }
}

// ─── Eligibility ───

/** Why a purchase can't get a new Refund Request right now. */
export type RefundBlock =
  | "open-request"
  | "already-approved"
  | "not-started"
  | "window-closed"
  | "completed-too-much"
  | "watched-too-much"
  | "seat-claimed";

export const REFUND_BLOCK_MESSAGES: Record<RefundBlock, string> = {
  "open-request": "You already have an open refund request on this purchase.",
  "already-approved": "This purchase has already been refunded.",
  "not-started": "This purchase is dated in the future.",
  "window-closed": `The ${REFUND_WINDOW_DAYS}-day window has closed.`,
  "completed-too-much":
    "You have completed too much of this course to request a refund.",
  "watched-too-much":
    "You have watched too much of this course to request a refund.",
  "seat-claimed": "A claimed team seat cannot be refunded.",
};

/** Short labels for the Admin page, where the rule is a warning. */
export const REFUND_BLOCK_WARNINGS: Partial<Record<RefundBlock, string>> = {
  "window-closed": `Now outside the ${REFUND_WINDOW_DAYS}-day window`,
  "completed-too-much": `Has now completed ${REFUND_COMPLETION_LIMIT * 100}% or more of the lessons`,
  "watched-too-much": `Has now watched ${REFUND_WATCH_LIMIT_SECONDS / 3600} hours or more`,
  "seat-claimed": "A Seat has been claimed",
};

// The window is counted in whole calendar days, not hours — someone who buys
// at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

function daysBetween(fromDay: string, toDay: string) {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function getCourseLessonIds(db: Queryable, courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

/**
 * Seconds watched across the whole course, counting the learner's entire
 * history — including earlier purchases — so buying, watching half, refunding
 * and buying again doesn't reset the clock.
 */
function getSecondsWatched(db: Queryable, userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;
  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

function getCompletedLessonCount(db: Queryable, userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();
  return row?.count ?? 0;
}

function getSeatCounts(db: Queryable, purchaseId: number) {
  const row = db
    .select({
      total: sql<number>`count(*)`,
      claimed: sql<number>`count(${coupons.redeemedAt})`,
    })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .get();
  return { total: row?.total ?? 0, claimed: row?.claimed ?? 0 };
}

export type RefundRuleCheck = {
  blocks: RefundBlock[];
  lastDayInWindow: string;
  daysLeftInWindow: number;
  completedLessons: number;
  totalLessons: number;
  watchedSeconds: number;
  seats: { total: number; claimed: number };
};

/**
 * Checks a purchase against every refund rule, as things stand at `now`.
 * The learner's refund form, the refund action and the Admin page all use it,
 * so the rules can't drift apart.
 */
export function checkRefundRules(
  db: Db,
  purchase: typeof purchases.$inferSelect,
  now: Date = new Date()
): RefundRuleCheck {
  const blocks: RefundBlock[] = [];

  const requests = db
    .select({ status: refundRequests.status })
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchase.id))
    .all();
  if (requests.some((r) => r.status === RefundRequestStatus.Open)) {
    blocks.push("open-request");
  }
  if (requests.some((r) => r.status === RefundRequestStatus.Approved)) {
    blocks.push("already-approved");
  }

  const today = calendarDay(now);
  const purchasedDay = calendarDay(new Date(purchase.createdAt));
  const lastDayInWindow = lastDayOfWindow(purchase.createdAt);
  if (today < purchasedDay) blocks.push("not-started");
  if (today > lastDayInWindow) blocks.push("window-closed");

  const lessonIds = getCourseLessonIds(db, purchase.courseId);
  const completedLessons = getCompletedLessonCount(
    db,
    purchase.userId,
    lessonIds
  );
  if (
    lessonIds.length > 0 &&
    completedLessons / lessonIds.length >= REFUND_COMPLETION_LIMIT
  ) {
    blocks.push("completed-too-much");
  }

  const watchedSeconds = getSecondsWatched(db, purchase.userId, lessonIds);
  if (watchedSeconds >= REFUND_WATCH_LIMIT_SECONDS) {
    blocks.push("watched-too-much");
  }

  const seats = getSeatCounts(db, purchase.id);
  if (seats.claimed > 0) blocks.push("seat-claimed");

  return {
    blocks,
    lastDayInWindow,
    daysLeftInWindow: Math.max(0, daysBetween(today, lastDayInWindow)),
    completedLessons,
    totalLessons: lessonIds.length,
    watchedSeconds,
    seats,
  };
}

export function getLatestPurchase(db: Db, userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .get();
}

export type RefundOffer = {
  purchaseId: number;
  amount: number;
  lastDayInWindow: string;
  /** Unclaimed Seats that become Held Seats while the request is open. */
  seatCount: number;
};

/**
 * What the learner is offered if they want their money back on their latest
 * purchase of a course, or why they can't have it.
 */
export function getRefundOffer(
  db: Db,
  userId: number,
  courseId: number,
  now: Date = new Date()
): { offer: RefundOffer } | { block: RefundBlock | "no-purchase" } {
  const purchase = getLatestPurchase(db, userId, courseId);
  if (!purchase) return { block: "no-purchase" };

  const check = checkRefundRules(db, purchase, now);
  if (check.blocks.length > 0) return { block: check.blocks[0] };

  return {
    offer: {
      purchaseId: purchase.id,
      amount: purchase.amountPaid,
      lastDayInWindow: check.lastDayInWindow,
      seatCount: check.seats.total,
    },
  };
}

/** Is this purchase's Seat on hold because a Refund Request is open? */
export function hasOpenRefundRequest(db: Db, purchaseId: number) {
  return !!db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Open)
      )
    )
    .get();
}

// ─── Emails ───
// There is no mail transport wired up yet; routes log these to the console.

export type Email = { to: string; subject: string; body: string };

export function sendEmail(email: Email) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}

function signOff(lines: string[]) {
  return [...lines, "", "— The Cadence team"].join("\n");
}

export function buildRefundRequestedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  seatCount: number;
}): Email {
  const lines = [
    `Hi ${input.learnerName},`,
    "",
    `We have your refund request for "${input.courseTitle}".`,
    `The refund is for ${formatPrice(input.amount)}, the amount you paid.`,
  ];
  if (input.seatCount > 0) {
    lines.push(
      "",
      `While we decide, none of your ${input.seatCount} team codes can be redeemed. If we approve, they stop working for good.`
    );
  }
  lines.push(
    "",
    "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done."
  );
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: signOff(lines),
  };
}

function buildDecisionEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  approved: boolean;
  decisionNote: string | null;
  seatCount: number;
}): Email {
  const lines = [`Hi ${input.learnerName},`, ""];
  if (input.approved) {
    lines.push(
      `We've approved your refund request for "${input.courseTitle}".`,
      `${formatPrice(input.amount)} is on its way back to you — we'll email you again once it has been sent.`,
      input.seatCount > 0
        ? `Your ${input.seatCount} team codes no longer work.`
        : "You no longer have access to the course."
    );
  } else {
    lines.push(
      `We've declined your refund request for "${input.courseTitle}".`
    );
    if (input.seatCount > 0) {
      lines.push("Your team codes can be redeemed again.");
    }
  }
  if (input.decisionNote) {
    lines.push("", input.decisionNote);
  }
  return {
    to: input.learnerEmail,
    subject: `Refund ${input.approved ? "approved" : "declined"} — ${input.courseTitle}`,
    body: signOff(lines),
  };
}

function buildRefundIssuedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}): Email {
  return {
    to: input.learnerEmail,
    subject: `Refund sent — ${input.courseTitle}`,
    body: signOff([
      `Hi ${input.learnerName},`,
      "",
      `We've sent your refund of ${formatPrice(input.amount)} for "${input.courseTitle}".`,
    ]),
  };
}

// ─── Requesting ───

export function createRefundRequest(
  db: Db,
  input: { purchaseId: number; reason: string; now?: Date }
) {
  return db
    .insert(refundRequests)
    .values({
      purchaseId: input.purchaseId,
      status: RefundRequestStatus.Open,
      reason: input.reason,
      requestedAt: (input.now ?? new Date()).toISOString(),
    })
    .returning()
    .get();
}

// ─── Deciding ───

function getRequestContext(db: Queryable, refundRequestId: number) {
  return db
    .select({
      request: refundRequests,
      purchase: purchases,
      learner: { id: users.id, name: users.name, email: users.email },
      course: { id: courses.id, title: courses.title },
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refundRequests.id, refundRequestId))
    .get();
}

function cleanNote(note: string | null | undefined) {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Approves an Open Refund Request: creates a Pending Refund for the full
 * amount paid, revokes the learner's Enrollment (or, for a team purchase,
 * voids every unclaimed Seat), and returns the email to send.
 */
export function approveRefundRequest(
  db: Db,
  input: {
    refundRequestId: number;
    adminId: number;
    decisionNote?: string | null;
    now?: Date;
  }
) {
  const now = (input.now ?? new Date()).toISOString();
  const decisionNote = cleanNote(input.decisionNote);

  return db.transaction((tx) => {
    const ctx = getRequestContext(tx, input.refundRequestId);
    if (!ctx) throw new RefundError("not-found", "Refund request not found.");

    const decided = tx
      .update(refundRequests)
      .set({
        status: RefundRequestStatus.Approved,
        decisionNote,
        decidedAt: now,
        decidedByUserId: input.adminId,
      })
      .where(
        and(
          eq(refundRequests.id, input.refundRequestId),
          eq(refundRequests.status, RefundRequestStatus.Open)
        )
      )
      .returning()
      .get();
    if (!decided) {
      throw new RefundError(
        "already-decided",
        "Another Admin has already decided this refund request."
      );
    }

    const refund = tx
      .insert(refunds)
      .values({
        refundRequestId: decided.id,
        amount: ctx.purchase.amountPaid,
        status: RefundStatus.Pending,
        createdAt: now,
      })
      .returning()
      .get();

    const seatCount = getSeatCounts(tx, ctx.purchase.id).total;
    if (seatCount > 0) {
      tx.update(coupons)
        .set({ voidedAt: now })
        .where(
          and(
            eq(coupons.purchaseId, ctx.purchase.id),
            isNull(coupons.redeemedAt),
            isNull(coupons.voidedAt)
          )
        )
        .run();
    } else {
      tx.update(enrollments)
        .set({ revokedAt: now, revocationReason: RevocationReason.Refunded })
        .where(
          and(
            eq(enrollments.userId, ctx.purchase.userId),
            eq(enrollments.courseId, ctx.purchase.courseId),
            isActiveEnrollment
          )
        )
        .run();
    }

    return {
      request: decided,
      refund,
      email: buildDecisionEmail({
        learnerName: ctx.learner.name,
        learnerEmail: ctx.learner.email,
        courseTitle: ctx.course.title,
        amount: ctx.purchase.amountPaid,
        approved: true,
        decisionNote,
        seatCount,
      }),
    };
  });
}

/**
 * Declines an Open Refund Request. The Decision Note is required — a learner
 * who is told no without a reason can't tell whether asking again is worth it.
 */
export function declineRefundRequest(
  db: Db,
  input: {
    refundRequestId: number;
    adminId: number;
    decisionNote: string;
    now?: Date;
  }
) {
  const now = (input.now ?? new Date()).toISOString();
  const decisionNote = cleanNote(input.decisionNote);
  if (!decisionNote) {
    throw new RefundError(
      "note-required",
      "Tell the learner why you're declining."
    );
  }

  return db.transaction((tx) => {
    const ctx = getRequestContext(tx, input.refundRequestId);
    if (!ctx) throw new RefundError("not-found", "Refund request not found.");

    const decided = tx
      .update(refundRequests)
      .set({
        status: RefundRequestStatus.Declined,
        decisionNote,
        decidedAt: now,
        decidedByUserId: input.adminId,
      })
      .where(
        and(
          eq(refundRequests.id, input.refundRequestId),
          eq(refundRequests.status, RefundRequestStatus.Open)
        )
      )
      .returning()
      .get();
    if (!decided) {
      throw new RefundError(
        "already-decided",
        "Another Admin has already decided this refund request."
      );
    }

    return {
      request: decided,
      email: buildDecisionEmail({
        learnerName: ctx.learner.name,
        learnerEmail: ctx.learner.email,
        courseTitle: ctx.course.title,
        amount: ctx.purchase.amountPaid,
        approved: false,
        decisionNote,
        seatCount: getSeatCounts(tx, ctx.purchase.id).total,
      }),
    };
  });
}

// ─── Moving a Refund ───

function moveRefund(
  db: Db,
  input: {
    refundId: number;
    adminId: number;
    from: RefundStatus;
    to: RefundStatus;
    kind: RefundEventKind;
    note?: string | null;
    now?: Date;
  }
) {
  const now = (input.now ?? new Date()).toISOString();
  return db.transaction((tx) => {
    const moved = tx
      .update(refunds)
      .set({
        status: input.to,
        ...(input.to === RefundStatus.Issued ? { issuedAt: now } : {}),
      })
      .where(and(eq(refunds.id, input.refundId), eq(refunds.status, input.from)))
      .returning()
      .get();
    if (!moved) {
      const exists = tx
        .select({ id: refunds.id })
        .from(refunds)
        .where(eq(refunds.id, input.refundId))
        .get();
      throw exists
        ? new RefundError(
            "wrong-refund-state",
            `This refund is no longer ${input.from}.`
          )
        : new RefundError("not-found", "Refund not found.");
    }
    tx.insert(refundEvents)
      .values({
        refundId: moved.id,
        kind: input.kind,
        note: cleanNote(input.note),
        byUserId: input.adminId,
        createdAt: now,
      })
      .run();
    return moved;
  });
}

/** A Pending Refund whose money has been confirmed as sent. */
export function markRefundIssued(
  db: Db,
  input: { refundId: number; adminId: number; now?: Date }
) {
  const refund = moveRefund(db, {
    ...input,
    from: RefundStatus.Pending,
    to: RefundStatus.Issued,
    kind: RefundEventKind.Issued,
  });
  const ctx = getRequestContext(db, refund.refundRequestId)!;
  return {
    refund,
    email: buildRefundIssuedEmail({
      learnerName: ctx.learner.name,
      learnerEmail: ctx.learner.email,
      courseTitle: ctx.course.title,
      amount: refund.amount,
    }),
  };
}

/** A Pending Refund whose money couldn't be sent. The note is Admin-only. */
export function markRefundFailed(
  db: Db,
  input: { refundId: number; adminId: number; note: string; now?: Date }
) {
  if (!cleanNote(input.note)) {
    throw new RefundError(
      "note-required",
      "Say what went wrong, so the next Admin knows before retrying."
    );
  }
  return moveRefund(db, {
    ...input,
    from: RefundStatus.Pending,
    to: RefundStatus.Failed,
    kind: RefundEventKind.Failed,
  });
}

/** Turns a Failed Refund back into a Pending one. */
export function retryRefund(
  db: Db,
  input: { refundId: number; adminId: number; now?: Date }
) {
  return moveRefund(db, {
    ...input,
    from: RefundStatus.Failed,
    to: RefundStatus.Pending,
    kind: RefundEventKind.Retried,
  });
}

// ─── Reading for the learner ───

/** Learners in a course who have no Active Enrollment because of a refund. */
export function getRefundedLearnerIds(
  db: Db,
  courseId: number,
  userIds: number[]
): Set<number> {
  if (userIds.length === 0) return new Set();
  const revoked = db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        inArray(enrollments.userId, userIds),
        eq(enrollments.revocationReason, RevocationReason.Refunded)
      )
    )
    .all()
    .map((row) => row.userId);
  if (revoked.length === 0) return new Set();
  const active = new Set(
    db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, courseId),
          inArray(enrollments.userId, revoked),
          isActiveEnrollment
        )
      )
      .all()
      .map((row) => row.userId)
  );
  return new Set(revoked.filter((id) => !active.has(id)));
}

// ─── Reading for Admins ───

export const REFUND_TABS = ["needs-action", "approved", "declined", "all"] as const;
export type RefundTab = (typeof REFUND_TABS)[number];

/**
 * Open Refund Requests plus Pending and Failed Refunds — everything waiting on
 * an Admin. The sidebar badge and the default tab use the same count.
 */
export function countRefundsNeedingAction(db: Db) {
  const open = db
    .select({ count: sql<number>`count(*)` })
    .from(refundRequests)
    .where(eq(refundRequests.status, RefundRequestStatus.Open))
    .get();
  const moving = db
    .select({ count: sql<number>`count(*)` })
    .from(refunds)
    .where(inArray(refunds.status, [RefundStatus.Pending, RefundStatus.Failed]))
    .get();
  return (open?.count ?? 0) + (moving?.count ?? 0);
}

function needsAction(
  status: RefundRequestStatus,
  refundStatus: RefundStatus | null
) {
  return (
    status === RefundRequestStatus.Open ||
    refundStatus === RefundStatus.Pending ||
    refundStatus === RefundStatus.Failed
  );
}

export function listRefundRequestsForAdmin(
  db: Db,
  tab: RefundTab,
  now: Date = new Date()
) {
  const rows = db
    .select({
      request: refundRequests,
      purchase: purchases,
      learner: { id: users.id, name: users.name, email: users.email },
      course: { id: courses.id, title: courses.title, slug: courses.slug },
      refund: refunds,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .leftJoin(refunds, eq(refunds.refundRequestId, refundRequests.id))
    .orderBy(refundRequests.requestedAt, refundRequests.id)
    .all()
    .filter((row) => {
      const status = row.request.status;
      if (tab === "needs-action")
        return needsAction(status, row.refund?.status ?? null);
      if (tab === "approved") return status === RefundRequestStatus.Approved;
      if (tab === "declined") return status === RefundRequestStatus.Declined;
      return true;
    });

  // Decided tabs read newest first; the work queue reads oldest first.
  if (tab !== "needs-action") rows.reverse();

  const userNames = new Map(
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .all()
      .map((u) => [u.id, u.name])
  );
  const nameOf = (id: number | null) =>
    id === null ? null : (userNames.get(id) ?? `User #${id}`);

  return rows.map((row) => {
    const earlier = db
      .select({
        status: refundRequests.status,
        decisionNote: refundRequests.decisionNote,
        decidedAt: refundRequests.decidedAt,
      })
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.purchaseId, row.purchase.id),
          eq(refundRequests.status, RefundRequestStatus.Declined),
          sql`${refundRequests.id} <> ${row.request.id}`,
          sql`${refundRequests.requestedAt} <= ${row.request.requestedAt}`
        )
      )
      .all();

    const check = checkRefundRules(db, row.purchase, now);
    const isOpen = row.request.status === RefundRequestStatus.Open;
    // While it's open, the request itself is the open request; warnings are
    // about the rules the learner would now fail.
    const warnings = isOpen
      ? check.blocks
          .map((block) => REFUND_BLOCK_WARNINGS[block])
          .filter((w): w is string => !!w)
      : [];

    const events = row.refund
      ? db
          .select()
          .from(refundEvents)
          .where(eq(refundEvents.refundId, row.refund.id))
          .orderBy(refundEvents.createdAt, refundEvents.id)
          .all()
          .map((event) => ({
            id: event.id,
            kind: event.kind,
            note: event.note,
            by: nameOf(event.byUserId),
            at: event.createdAt,
          }))
      : [];

    return {
      id: row.request.id,
      status: row.request.status,
      reason: row.request.reason,
      requestedAt: row.request.requestedAt,
      decisionNote: row.request.decisionNote,
      decidedAt: row.request.decidedAt,
      decidedBy: nameOf(row.request.decidedByUserId),
      learner: row.learner,
      course: row.course,
      purchase: {
        id: row.purchase.id,
        amountPaid: row.purchase.amountPaid,
        createdAt: row.purchase.createdAt,
        country: row.purchase.country,
      },
      seats: check.seats,
      earlierDeclines: earlier,
      now: {
        watchedSeconds: check.watchedSeconds,
        completedLessons: check.completedLessons,
        totalLessons: check.totalLessons,
        daysLeftInWindow: check.daysLeftInWindow,
        lastDayInWindow: check.lastDayInWindow,
      },
      warnings,
      refund: row.refund
        ? {
            id: row.refund.id,
            status: row.refund.status,
            amount: row.refund.amount,
            issuedAt: row.refund.issuedAt,
            events,
          }
        : null,
    };
  });
}

export type AdminRefundRow = ReturnType<typeof listRefundRequestsForAdmin>[number];
