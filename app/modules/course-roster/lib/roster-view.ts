import { LessonProgressStatus } from "~/db/schema";

export type RosterSortKey = "name" | "enrolledAt" | "progress";

export type SortDirection = "asc" | "desc";

export type RosterView = {
  search: string;
  status: LessonProgressStatus | "all";
  sortBy: RosterSortKey;
  direction: SortDirection;
};

export type RosterRow = {
  name: string;
  email: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
};

export const defaultRosterView: RosterView = {
  search: "",
  status: "all",
  sortBy: "name",
  direction: "asc",
};

export function rosterStatus(row: RosterRow): LessonProgressStatus {
  if (row.completedAt) return LessonProgressStatus.Completed;
  if (row.progress > 0) return LessonProgressStatus.InProgress;
  return LessonProgressStatus.NotStarted;
}

function searchNeedle(search: string) {
  return search.trim().toLowerCase();
}

/** Whether the view hides any student: a search or a status filter. */
export function isRosterFiltered(view: RosterView) {
  return searchNeedle(view.search) !== "" || view.status !== "all";
}

function matchesSearch(row: RosterRow, search: string) {
  const needle = searchNeedle(search);
  return (
    row.name.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle)
  );
}

function compareNames(a: RosterRow, b: RosterRow) {
  return a.name.localeCompare(b.name);
}

function compareBy(sortBy: RosterSortKey) {
  if (sortBy === "progress") {
    return (a: RosterRow, b: RosterRow) => a.progress - b.progress;
  }
  if (sortBy === "enrolledAt") {
    return (a: RosterRow, b: RosterRow) =>
      a.enrolledAt.localeCompare(b.enrolledAt);
  }
  return compareNames;
}

export function viewRoster<T extends RosterRow>(
  rows: readonly T[],
  view: RosterView
): T[] {
  const compare = compareBy(view.sortBy);
  const ordered = (a: T, b: T) =>
    view.direction === "asc" ? compare(a, b) : compare(b, a);
  return rows
    .filter((row) => matchesSearch(row, view.search))
    .filter((row) => view.status === "all" || rosterStatus(row) === view.status)
    .sort((a, b) => ordered(a, b) || compareNames(a, b));
}

const firstDirection: Record<RosterSortKey, SortDirection> = {
  name: "asc",
  enrolledAt: "desc",
  progress: "desc",
};

export function sortRosterBy(
  view: RosterView,
  sortBy: RosterSortKey
): RosterView {
  if (view.sortBy !== sortBy) {
    return { ...view, sortBy, direction: firstDirection[sortBy] };
  }
  return { ...view, direction: view.direction === "asc" ? "desc" : "asc" };
}
