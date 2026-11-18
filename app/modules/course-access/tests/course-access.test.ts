import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import { approveRefundRequest, raiseRefundRequest } from "~/lib/refunds.server";
import { claimSeat } from "~/lib/seat-claims.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import { createCourseAccess } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let access: ReturnType<typeof createCourseAccess>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  access = createCourseAccess(db);
});

// ─── Fixtures ───

let emailCounter = 0;

function addUser(role = schema.UserRole.Student) {
  emailCounter += 1;
  return db
    .insert(schema.users)
    .values({
      name: `User ${emailCounter}`,
      email: `user${emailCounter}@example.com`,
      role,
    })
    .returning()
    .get();
}

const PRICE = 4999;

function setCoursePrice(price: number, pppEnabled = true) {
  db.update(schema.courses)
    .set({ price, pppEnabled })
    .where(eq(schema.courses.id, base.course.id))
    .run();
}

function enroll(student: { id: number }) {
  const enrolled = enrollStudentInTransaction(
    db,
    student.id,
    base.course.id,
    new Date()
  );
  if (!enrolled.ok) throw new Error(enrolled.error);
}

// No library function records a Purchase (or a Team Licence's Seats) on its
// own, so those rows are inserted directly.

/** An Individual Purchase, without the Enrollment it gives. */
function addIndividualPurchase(
  student: { id: number },
  country: string | null
) {
  return db
    .insert(schema.purchases)
    .values({
      userId: student.id,
      courseId: base.course.id,
      amountPaid: PRICE,
      country,
    })
    .returning()
    .get();
}

/** An Individual Purchase and the Enrollment it gives. */
function buyForSelf(student: { id: number }, country: string | null) {
  const purchase = addIndividualPurchase(student, country);
  enroll(student);
  return purchase;
}

async function raiseRefund(purchase: { id: number; userId: number }) {
  const raised = await raiseRefundRequest(
    db,
    purchase.id,
    purchase.userId,
    "Changed my mind",
    new Date(),
    fakeNotifications()
  );
  if (!raised.ok) throw new Error(raised.error);
  return raised.refundRequestId;
}

async function approveRefund(purchase: { id: number; userId: number }) {
  const refundRequestId = await raiseRefund(purchase);
  const approved = await approveRefundRequest(
    db,
    refundRequestId,
    addUser(schema.UserRole.Admin).id,
    null,
    new Date(),
    fakeNotifications()
  );
  if (!approved.ok) throw new Error(approved.error);
}

/** A Team Licence the Team Admin bought, with one Unclaimed Seat on it. */
function buyTeamLicence(teamAdmin: { id: number }, country: string | null) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdmin.id,
      courseId: base.course.id,
      amountPaid: PRICE,
      country,
    })
    .returning()
    .get();
  const seat = db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: `SEAT-${purchase.id}`,
      purchaseId: purchase.id,
    })
    .returning()
    .get();
  return { purchase, seat };
}

/** The Student claims a Seat on a Team Licence bought in `country`. */
async function claimSeatBoughtIn(student: { id: number }, country: string) {
  const { seat } = buyTeamLicence(addUser(), country);
  const claimed = await claimSeat(
    db,
    seat.code,
    student.id,
    country,
    new Date(),
    fakeNotifications()
  );
  if (!claimed.ok) throw new Error(claimed.error);
}

function viewerFor(user: { id: number }, country: string | null = "US") {
  return { userId: user.id, country };
}

describe("Course Access", () => {
  it("is signed-out for a visitor with no user", () => {
    const viewer = { userId: null, country: "US" };
    expect(access.decide(viewer, base.course.id)).toEqual({
      kind: "signed-out",
    });
    expect(access.canManage(viewer, base.course.id)).toBe(false);
  });

  it("is not-enrolled for a signed-in Student without an Enrollment", () => {
    const viewer = viewerFor(base.user);
    expect(access.decide(viewer, base.course.id)).toEqual({
      kind: "not-enrolled",
    });
    expect(access.canManage(viewer, base.course.id)).toBe(false);
  });

  it("is course-not-found for a course that doesn't exist", () => {
    const missingCourseId = base.course.id + 999;
    for (const viewer of [
      viewerFor(base.user),
      viewerFor(addUser(schema.UserRole.Admin)),
      { userId: null, country: null },
    ]) {
      expect(access.decide(viewer, missingCourseId)).toEqual({
        kind: "course-not-found",
      });
      expect(access.canManage(viewer, missingCourseId)).toBe(false);
    }
  });

  describe("Manage", () => {
    it("lets the owning Instructor Manage and take the course without an Enrollment", () => {
      const viewer = viewerFor(base.instructor);
      expect(access.decide(viewer, base.course.id)).toEqual({
        kind: "allowed",
        via: "manage",
        userId: base.instructor.id,
      });
      expect(access.canManage(viewer, base.course.id)).toBe(true);
    });

    it("lets a Platform Admin Manage and take the course without an Enrollment", () => {
      const admin = addUser(schema.UserRole.Admin);
      const viewer = viewerFor(admin);
      expect(access.decide(viewer, base.course.id)).toEqual({
        kind: "allowed",
        via: "manage",
        userId: admin.id,
      });
      expect(access.canManage(viewer, base.course.id)).toBe(true);
    });

    it("doesn't let another Instructor Manage the course", () => {
      const viewer = viewerFor(addUser(schema.UserRole.Instructor));
      expect(access.decide(viewer, base.course.id)).toEqual({
        kind: "not-enrolled",
      });
      expect(access.canManage(viewer, base.course.id)).toBe(false);
    });
  });

  describe("Enrollment", () => {
    beforeEach(() => setCoursePrice(PRICE));

    it("allows a Student who bought at full price, from any country", () => {
      buyForSelf(base.user, "US");
      for (const country of ["US", "IN", "FR", null]) {
        const viewer = viewerFor(base.user, country);
        expect(access.decide(viewer, base.course.id)).toEqual({
          kind: "allowed",
          via: "enrollment",
          userId: base.user.id,
        });
        expect(access.canManage(viewer, base.course.id)).toBe(false);
      }
    });
  });

  describe("Region-Locked", () => {
    function allowed() {
      return { kind: "allowed", via: "enrollment", userId: base.user.id };
    }

    function decideFrom(student: { id: number }, country: string | null) {
      return access.decide(viewerFor(student, country), base.course.id);
    }

    beforeEach(() => setCoursePrice(PRICE));

    describe("a Purchase at a Purchasing-Power Price from India", () => {
      beforeEach(() => buyForSelf(base.user, "IN"));

      it("allows it opened from India", () => {
        expect(decideFrom(base.user, "IN")).toEqual(allowed());
      });

      it("Region-Locks it opened from France, with both countries", () => {
        expect(decideFrom(base.user, "FR")).toEqual({
          kind: "region-locked",
          purchaseCountry: "IN",
          currentCountry: "FR",
        });
      });

      it("allows it opened from an unknown country", () => {
        expect(decideFrom(base.user, null)).toEqual(allowed());
      });
    });

    it("never Region-Locks a free course", () => {
      setCoursePrice(0);
      buyForSelf(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(allowed());
    });

    it("never Region-Locks a course with Purchasing-Power Prices turned off", () => {
      setCoursePrice(PRICE, false);
      buyForSelf(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(allowed());
    });

    it("never Region-Locks a Purchase with no recorded country", () => {
      buyForSelf(base.user, null);
      expect(decideFrom(base.user, "FR")).toEqual(allowed());
    });

    it("never Region-Locks a Student with a Claimed Seat opening from another country", async () => {
      await claimSeatBoughtIn(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(allowed());
    });

    it("lets a Claimed Seat override an Individual Purchase at a Purchasing-Power Price from elsewhere", async () => {
      addIndividualPurchase(base.user, "IN");
      await claimSeatBoughtIn(base.user, "FR");
      expect(decideFrom(base.user, "FR")).toEqual(allowed());
    });

    describe("a refunded Purchase", () => {
      it("is ignored when a Purchase at a Purchasing-Power Price was refunded and a full-price one followed", async () => {
        await approveRefund(addIndividualPurchase(base.user, "IN"));
        buyForSelf(base.user, "US");
        expect(decideFrom(base.user, "FR")).toEqual(allowed());
      });

      it("is ignored when a full-price Purchase was refunded and one at a Purchasing-Power Price followed", async () => {
        await approveRefund(addIndividualPurchase(base.user, "US"));
        buyForSelf(base.user, "IN");
        expect(decideFrom(base.user, "FR")).toEqual({
          kind: "region-locked",
          purchaseCountry: "IN",
          currentCountry: "FR",
        });
      });

      it("still counts while its Refund Request is Open", async () => {
        await raiseRefund(buyForSelf(base.user, "IN"));
        expect(decideFrom(base.user, "FR")).toMatchObject({
          kind: "region-locked",
        });
      });
    });

    describe("a Team Admin's Team Licence", () => {
      it("is ignored next to their own full-price Individual Purchase", () => {
        buyTeamLicence(base.user, "IN");
        buyForSelf(base.user, "US");
        expect(decideFrom(base.user, "FR")).toEqual(allowed());
      });

      it("doesn't shield their own Individual Purchase at a Purchasing-Power Price", () => {
        buyTeamLicence(base.user, "US");
        buyForSelf(base.user, "IN");
        expect(decideFrom(base.user, "FR")).toEqual({
          kind: "region-locked",
          purchaseCountry: "IN",
          currentCountry: "FR",
        });
      });
    });
  });

  describe("assess", () => {
    it("gives the decision and whether the viewer can Manage the course together", () => {
      const otherInstructor = addUser(schema.UserRole.Instructor);
      expect(access.assess(viewerFor(base.instructor), base.course.id)).toEqual(
        {
          decision: {
            kind: "allowed",
            via: "manage",
            userId: base.instructor.id,
          },
          canManage: true,
        }
      );
      expect(access.assess(viewerFor(otherInstructor), base.course.id)).toEqual(
        {
          decision: { kind: "not-enrolled" },
          canManage: false,
        }
      );
      expect(
        access.assess({ userId: null, country: "US" }, base.course.id)
      ).toEqual({ decision: { kind: "signed-out" }, canManage: false });
      expect(
        access.assess(viewerFor(base.instructor), base.course.id + 999)
      ).toEqual({ decision: { kind: "course-not-found" }, canManage: false });
    });
  });

  describe("findPerson", () => {
    it("is null when signed out or the user no longer exists", () => {
      expect(access.findPerson({ userId: null, country: null })).toBeNull();
      expect(access.findPerson({ userId: 9999, country: null })).toBeNull();
    });

    it("says whether the person is an Instructor or a Platform Admin", () => {
      const admin = addUser(schema.UserRole.Admin);
      expect(access.findPerson(viewerFor(base.user))).toEqual({
        userId: base.user.id,
        isInstructor: false,
        isPlatformAdmin: false,
      });
      expect(access.findPerson(viewerFor(base.instructor))).toEqual({
        userId: base.instructor.id,
        isInstructor: true,
        isPlatformAdmin: false,
      });
      expect(access.findPerson(viewerFor(admin))).toEqual({
        userId: admin.id,
        isInstructor: false,
        isPlatformAdmin: true,
      });
    });
  });
});
