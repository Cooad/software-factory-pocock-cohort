import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "~/db/schema";
import {
  coupons,
  purchases,
  teamMembers,
  teams,
  TeamMemberRole,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

function insertPurchase(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
) {
  return db
    .insert(purchases)
    .values({
      userId: buyerId,
      courseId,
      amountPaid,
      country,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
}

export function createIndividualPurchase(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
) {
  return insertPurchase(db, buyerId, courseId, amountPaid, country, now);
}

function getTeamForAdmin(db: Db, userId: number) {
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

function getOrCreateTeamForUser(db: Db, userId: number) {
  const existingTeam = getTeamForAdmin(db, userId);
  if (existingTeam) return existingTeam;

  const team = db.insert(teams).values({}).returning().get();
  db.insert(teamMembers)
    .values({ teamId: team.id, userId, role: TeamMemberRole.Admin })
    .run();
  return team;
}

export function createTeamLicence(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  seatCount: number,
  now: Date
) {
  const purchase = insertPurchase(
    db,
    buyerId,
    courseId,
    amountPaid,
    country,
    now
  );
  const team = getOrCreateTeamForUser(db, buyerId);
  const seats = Array.from({ length: seatCount }, () =>
    db
      .insert(coupons)
      .values({
        teamId: team.id,
        courseId,
        code: crypto.randomBytes(12).toString("base64url"),
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, team, seats };
}
