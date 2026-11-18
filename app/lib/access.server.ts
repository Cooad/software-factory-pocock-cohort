import { data } from "react-router";
import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import {
  UserRole,
  users,
  courses,
  enrollments,
  purchases,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import { checkPppAccess } from "~/lib/ppp";

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getCourseById(id: number) {
  return db.select().from(courses).where(eq(courses.id, id)).get();
}

function findEnrollment(userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

function isUserEnrolled(userId: number, courseId: number) {
  return !!findEnrollment(userId, courseId);
}

function findPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .get();
}

// getAccess never throws — the lesson page needs to render a paywall preview for
// signed-out and unenrolled visitors rather than erroring. The require* wrappers
// are for the routes that should just reject.

export type Access = {
  userId: number | null;
  user: ReturnType<typeof getUserById>;
  isAdmin: boolean;
  isOwningInstructor: boolean;
  /** Owning instructor or admin — the people who speak for the course. */
  isStaff: boolean;
  enrolled: boolean;
  pppBlocked: boolean;
  pppBlockedCountry: string | null;
  pppPurchaseCountry: string | null;
  canViewContent: boolean;
};

const SIGNED_OUT: Access = {
  userId: null,
  user: undefined,
  isAdmin: false,
  isOwningInstructor: false,
  isStaff: false,
  enrolled: false,
  pppBlocked: false,
  pppBlockedCountry: null,
  pppPurchaseCountry: null,
  canViewContent: false,
};

export async function getAccess(
  request: Request,
  courseId: number
): Promise<Access> {
  const userId = await getCurrentUserId(request);
  if (!userId) return SIGNED_OUT;

  const user = getUserById(userId);
  if (!user) return SIGNED_OUT;

  const course = getCourseById(courseId);
  const isAdmin = user.role === UserRole.Admin;
  const isOwningInstructor = course?.instructorId === userId;
  const isStaff = isAdmin || isOwningInstructor;
  const enrolled = isUserEnrolled(userId, courseId);

  // PPP only restricts students who bought at a discount — staff are exempt.
  let ppp = {
    blocked: false,
    blockedCountry: null as string | null,
    purchaseCountry: null as string | null,
  };

  if (enrolled && !isStaff && course) {
    const purchase = findPurchase(userId, courseId);
    const currentCountry = await resolveCountry(request);
    ppp = checkPppAccess(
      course.price,
      course.pppEnabled,
      purchase?.country ?? null,
      currentCountry
    );
  }

  return {
    userId,
    user,
    isAdmin,
    isOwningInstructor,
    isStaff,
    enrolled,
    pppBlocked: ppp.blocked,
    pppBlockedCountry: ppp.blockedCountry,
    pppPurchaseCountry: ppp.purchaseCountry,
    canViewContent: isStaff || (enrolled && !ppp.blocked),
  };
}

export async function requireUserId(request: Request): Promise<number> {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  return userId;
}

/** Use in actions — loader guards don't protect actions. */
export async function requireContentAccess(
  request: Request,
  courseId: number
): Promise<Access> {
  const access = await getAccess(request, courseId);

  if (!access.userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  if (!access.canViewContent) {
    throw data("You must be enrolled in this course.", { status: 403 });
  }

  return access;
}

export async function requireStaff(
  request: Request,
  courseId: number
): Promise<Access> {
  const access = await getAccess(request, courseId);

  if (!access.userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  if (!access.isStaff) {
    throw data("Only this course's instructor can do that.", { status: 403 });
  }

  return access;
}

export async function requireInstructorOrAdmin(request: Request) {
  const userId = await requireUserId(request);
  const user = getUserById(userId);

  if (
    !user ||
    (user.role !== UserRole.Instructor && user.role !== UserRole.Admin)
  ) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  return { userId, user, isAdmin: user.role === UserRole.Admin };
}
