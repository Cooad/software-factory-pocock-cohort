import { db } from "~/db";
import {
  assess,
  canManage,
  decide,
  findPerson,
  type Db,
  type Viewer,
} from "./lib/course-access";

export type { CourseAccessDecision, Person, Viewer } from "./lib/course-access";

/**
 * Course Access bound to a database: what a viewer may do on a course. The
 * app uses `courseAccess`, which reads the app database; tests build their own
 * against a test database. Knows nothing about requests or HTTP — routes go
 * through `./request.server` instead.
 */
export function createCourseAccess(database: Db) {
  return {
    /**
     * Whether the viewer has Course Access right now, and if not, why not.
     * Never throws: signed out, not enrolled, Region-Locked and a missing
     * course are all decisions.
     */
    decide(viewer: Viewer, courseId: number) {
      return decide(database, viewer, courseId);
    },
    /** The owning Instructor or a Platform Admin. False for a missing course. */
    canManage(viewer: Viewer, courseId: number) {
      return canManage(database, viewer, courseId);
    },
    /** `decide` and `canManage` at once, for a caller that needs both. */
    assess(viewer: Viewer, courseId: number) {
      return assess(database, viewer, courseId);
    },
    /** The signed-in person and their role, or null when signed out. */
    findPerson(viewer: Viewer) {
      return findPerson(database, viewer);
    },
  };
}

export type CourseAccess = ReturnType<typeof createCourseAccess>;

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseAccess = /* @__PURE__ */ createCourseAccess(db);
