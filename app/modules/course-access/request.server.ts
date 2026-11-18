import { data } from "react-router";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import {
  courseAccess,
  type CourseAccessDecision,
  type Person,
  type Viewer,
} from "./index.server";

// The request adapter: reads the viewer from the request and turns Course
// Access decisions into HTTP errors. Routes use this; nothing else should.

const SIGNED_OUT_MESSAGE = "Select a user from the DevUI panel.";
const FORBIDDEN_MESSAGE = "You don't have permission to do that.";
const NOT_FOUND_MESSAGE = "Course not found.";

function signedOut(): never {
  throw data(SIGNED_OUT_MESSAGE, { status: 401 });
}

/**
 * Throws the fixed 403. For a route that must refuse without saying whether
 * the thing asked about exists.
 */
export function forbidden(): never {
  throw data(FORBIDDEN_MESSAGE, { status: 403 });
}

function notFound(): never {
  throw data(NOT_FOUND_MESSAGE, { status: 404 });
}

const viewers = new WeakMap<Request, Promise<Viewer>>();

/**
 * The viewer behind a request: the session's user and the resolved country.
 * Read once per request, however many checks a route makes.
 */
export function getViewer(request: Request): Promise<Viewer> {
  let viewer = viewers.get(request);
  if (!viewer) {
    viewer = readViewer(request);
    viewers.set(request, viewer);
  }
  return viewer;
}

async function readViewer(request: Request): Promise<Viewer> {
  const [userId, country] = await Promise.all([
    getCurrentUserId(request),
    resolveCountry(request),
  ]);
  return { userId, country };
}

/**
 * The viewer's Course Access decision and whether they can Manage the course.
 * Never throws — for pages that show a paywall instead of an error.
 */
export async function getCourseAccess(
  request: Request,
  courseId: number
): Promise<{
  viewer: Viewer;
  decision: CourseAccessDecision;
  canManage: boolean;
}> {
  const viewer = await getViewer(request);
  return {
    viewer,
    decision: courseAccess.decide(viewer, courseId),
    canManage: courseAccess.canManage(viewer, courseId),
  };
}

async function requirePerson(request: Request): Promise<Person> {
  const person = courseAccess.findPerson(await getViewer(request));
  if (!person) signedOut();
  return person;
}

/** Throws 401 unless someone is signed in. Returns their user id. */
export async function requireUserId(request: Request): Promise<number> {
  return (await requirePerson(request)).userId;
}

/**
 * Throws 401 when signed out, 404 when the course doesn't exist, and 403
 * without Course Access. Use in actions — loader guards don't protect actions.
 */
export async function requireContentAccess(
  request: Request,
  courseId: number
): Promise<{ userId: number; canManage: boolean }> {
  const { viewer, decision, canManage } = await getCourseAccess(
    request,
    courseId
  );
  switch (decision.kind) {
    case "allowed":
      return { userId: viewer.userId!, canManage };
    case "signed-out":
      return signedOut();
    case "course-not-found":
      return notFound();
    case "not-enrolled":
    case "region-locked":
      return forbidden();
  }
}

/**
 * Throws 401 when signed out, 404 when the course doesn't exist, and 403
 * unless the viewer can Manage it (its owning Instructor, or a Platform Admin).
 */
export async function requireManagePermission(
  request: Request,
  courseId: number
): Promise<{ userId: number }> {
  const { viewer, decision, canManage } = await getCourseAccess(
    request,
    courseId
  );
  if (decision.kind === "course-not-found") notFound();
  if (decision.kind === "signed-out") signedOut();
  if (!canManage) forbidden();
  return { userId: viewer.userId! };
}

/** Throws 401 when signed out, 403 unless a Platform Admin. */
export async function requirePlatformAdmin(request: Request): Promise<Person> {
  const person = await requirePerson(request);
  if (!person.isPlatformAdmin) forbidden();
  return person;
}

/** Throws 401 when signed out, 403 unless an Instructor. */
export async function requireInstructor(request: Request): Promise<Person> {
  const person = await requirePerson(request);
  if (!person.isInstructor) forbidden();
  return person;
}

/**
 * Throws 401 when signed out, 403 unless an Instructor or a Platform Admin,
 * without tying them to a course — for pages that span all of someone's
 * courses.
 */
export async function requireInstructorOrPlatformAdmin(
  request: Request
): Promise<Person> {
  const person = await requirePerson(request);
  if (!person.isInstructor && !person.isPlatformAdmin) forbidden();
  return person;
}
