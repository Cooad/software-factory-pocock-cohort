import { db } from "~/db";
import { getCourseRoster, type Db } from "./lib/roster-query";

export type { CourseRoster } from "./lib/roster-query";

/**
 * The students of a course, bound to a database. The app uses
 * `courseRoster`, which reads the app database; tests build their own
 * against a test database.
 */
export function createCourseRoster(database: Db) {
  return {
    /**
     * Every enrolled student of the course, with their progress (percent of
     * lessons completed) and their best score on each quiz, in lesson order.
     * A fixed number of queries, however many students the course has.
     */
    get(courseId: number) {
      return getCourseRoster(database, courseId);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseRoster = /* @__PURE__ */ createCourseRoster(db);
