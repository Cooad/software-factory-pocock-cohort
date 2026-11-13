import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { coupons, purchases, teamMembers, teams, TeamMemberRole } from "~/db/schema";
import {
  createEnrollment,
  type CreateEnrollmentResult,
} from "~/lib/enrollments.server";
import type { Notifier } from "~/lib/notifications.server";
import type { Db } from "~/lib/refunds.server";

// ─── Purchase service ───
// Buying a course for yourself (an Individual Purchase, which enrolls you) or
// for a team (a Team Licence, which enrolls nobody: its Seats enroll whoever
// claims them). Extracted from the purchase route so the difference is tested:
// only an Individual Purchase goes through `createEnrollment` and so sends the
// New Enrollment Notification.

type Purchase = typeof purchases.$inferSelect;
type Team = typeof teams.$inferSelect;
type Seat = typeof coupons.$inferSelect;

function createPurchase(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null
): Purchase {
  return db
    .insert(purchases)
    .values({ userId, courseId, amountPaid, country })
    .returning()
    .get();
}

/** The team the user is Team Admin of, if any. */
function getTeamForAdmin(db: Db, userId: number): Team | undefined {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function getOrCreateTeamForUser(db: Db, userId: number): Team {
  const existingTeam = getTeamForAdmin(db, userId);
  if (existingTeam) return existingTeam;

  const team = db.insert(teams).values({}).returning().get();
  db.insert(teamMembers)
    .values({ teamId: team.id, userId, role: TeamMemberRole.Admin })
    .returning()
    .get();
  return team;
}

function generateCoupons(
  db: Db,
  teamId: number,
  courseId: number,
  purchaseId: number,
  quantity: number
): Seat[] {
  const created: Seat[] = [];
  for (let i = 0; i < quantity; i++) {
    const coupon = db
      .insert(coupons)
      .values({
        teamId,
        courseId,
        code: crypto.randomBytes(12).toString("base64url"),
        purchaseId,
      })
      .returning()
      .get();
    created.push(coupon);
  }
  return created;
}

/** An Individual Purchase: records it and enrolls the buyer. */
export async function buyCourse(
  db: Db,
  notifier: Notifier,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
): Promise<CreateEnrollmentResult> {
  createPurchase(db, userId, courseId, amountPaid, country);
  return createEnrollment(db, notifier, userId, courseId, now);
}

/**
 * A Team Licence: records it and creates `quantity` Unclaimed Seats on the
 * buyer's team. The buyer is not enrolled, and nothing is notified.
 */
export function buyTeamLicence(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  quantity: number
): { purchase: Purchase; team: Team; coupons: Seat[] } {
  const purchase = createPurchase(db, userId, courseId, amountPaid, country);
  const team = getOrCreateTeamForUser(db, userId);
  const teamCoupons = generateCoupons(db, team.id, courseId, purchase.id, quantity);
  return { purchase, team, coupons: teamCoupons };
}
