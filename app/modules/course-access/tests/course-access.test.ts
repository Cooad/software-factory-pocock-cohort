import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
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
  db.insert(schema.enrollments)
    .values({ userId: student.id, courseId: base.course.id })
    .run();
}

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

function raiseRefund(purchase: { id: number }, status: schema.RefundStatus) {
  db.insert(schema.refunds)
    .values({ purchaseId: purchase.id, status, reason: "Changed my mind" })
    .run();
}

function approveRefund(purchase: { id: number }) {
  raiseRefund(purchase, schema.RefundStatus.Approved);
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
function claimSeatBoughtIn(student: { id: number }, country: string) {
  const { seat } = buyTeamLicence(addUser(), country);
  db.update(schema.coupons)
    .set({ redeemedByUserId: student.id, redeemedAt: new Date().toISOString() })
    .where(eq(schema.coupons.id, seat.id))
    .run();
  enroll(student);
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
      });
      expect(access.canManage(viewer, base.course.id)).toBe(true);
    });

    it("lets a Platform Admin Manage and take the course without an Enrollment", () => {
      const viewer = viewerFor(addUser(schema.UserRole.Admin));
      expect(access.decide(viewer, base.course.id)).toEqual({
        kind: "allowed",
        via: "manage",
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
        });
        expect(access.canManage(viewer, base.course.id)).toBe(false);
      }
    });
  });

  describe("Region-Locked", () => {
    const ALLOWED = { kind: "allowed", via: "enrollment" };

    function decideFrom(student: { id: number }, country: string | null) {
      return access.decide(viewerFor(student, country), base.course.id);
    }

    beforeEach(() => setCoursePrice(PRICE));

    describe("a Purchase at a Purchasing-Power Price from India", () => {
      beforeEach(() => buyForSelf(base.user, "IN"));

      it("allows it opened from India", () => {
        expect(decideFrom(base.user, "IN")).toEqual(ALLOWED);
      });

      it("Region-Locks it opened from France, with both countries", () => {
        expect(decideFrom(base.user, "FR")).toEqual({
          kind: "region-locked",
          purchaseCountry: "IN",
          currentCountry: "FR",
        });
      });

      it("allows it opened from an unknown country", () => {
        expect(decideFrom(base.user, null)).toEqual(ALLOWED);
      });
    });

    it("never Region-Locks a free course", () => {
      setCoursePrice(0);
      buyForSelf(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
    });

    it("never Region-Locks a course with Purchasing-Power Prices turned off", () => {
      setCoursePrice(PRICE, false);
      buyForSelf(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
    });

    it("never Region-Locks a Purchase with no recorded country", () => {
      buyForSelf(base.user, null);
      expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
    });

    it("never Region-Locks a Student with a Claimed Seat opening from another country", () => {
      claimSeatBoughtIn(base.user, "IN");
      expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
    });

    it("lets a Claimed Seat override an Individual Purchase at a Purchasing-Power Price from elsewhere", () => {
      addIndividualPurchase(base.user, "IN");
      claimSeatBoughtIn(base.user, "FR");
      expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
    });

    describe("a refunded Purchase", () => {
      it("is ignored when a Purchase at a Purchasing-Power Price was refunded and a full-price one followed", () => {
        approveRefund(addIndividualPurchase(base.user, "IN"));
        buyForSelf(base.user, "US");
        expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
      });

      it("is ignored when a full-price Purchase was refunded and one at a Purchasing-Power Price followed", () => {
        approveRefund(addIndividualPurchase(base.user, "US"));
        buyForSelf(base.user, "IN");
        expect(decideFrom(base.user, "FR")).toEqual({
          kind: "region-locked",
          purchaseCountry: "IN",
          currentCountry: "FR",
        });
      });

      it("still counts while its Refund Request is Open", () => {
        raiseRefund(buyForSelf(base.user, "IN"), schema.RefundStatus.Open);
        expect(decideFrom(base.user, "FR")).toMatchObject({
          kind: "region-locked",
        });
      });
    });

    describe("a Team Admin's Team Licence", () => {
      it("is ignored next to their own full-price Individual Purchase", () => {
        buyTeamLicence(base.user, "IN");
        buyForSelf(base.user, "US");
        expect(decideFrom(base.user, "FR")).toEqual(ALLOWED);
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
