import { db } from "~/db";
import {
  browseCatalog,
  type CatalogQuery,
  type CatalogViewer,
} from "./lib/course-catalog";
import type { Db } from "./lib/course-queries";

export type {
  CatalogBadge,
  CatalogCourse,
  CatalogQuery,
  CatalogViewer,
} from "./lib/course-catalog";

/**
 * The course list (`/courses`) bound to a database. The app uses
 * `courseCatalog`, which reads the app database; tests build their own
 * against a test database.
 */
export function createCourseCatalog(database: Db) {
  return {
    /**
     * The Published courses matching the query, newest first (at most 50),
     * each with the viewer's progress and badge, plus every category and whether
     * the Owned filter was applied. Badges and the Owned filter follow ADR-0014.
     */
    browse(viewer: CatalogViewer, query: CatalogQuery) {
      return browseCatalog(database, viewer, query);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseCatalog = /* @__PURE__ */ createCourseCatalog(db);
