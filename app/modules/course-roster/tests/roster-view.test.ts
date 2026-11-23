import { describe, it, expect } from "vitest";
import { LessonProgressStatus } from "~/db/schema";
import {
  defaultRosterView,
  rosterStatus,
  sortRosterBy,
  viewRoster,
  type RosterRow,
  type RosterView,
} from "../index";

function row(name: string, overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    enrolledAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    progress: 0,
    ...overrides,
  };
}

const ada = row("Ada", {
  enrolledAt: "2026-03-01T00:00:00.000Z",
  progress: 40,
});
const bob = row("bob", {
  email: "robert@work.dev",
  enrolledAt: "2026-01-15T00:00:00.000Z",
  progress: 100,
  completedAt: "2026-04-01T00:00:00.000Z",
});
const cy = row("Cy", { enrolledAt: "2026-02-01T00:00:00.000Z" });
const roster = [cy, bob, ada];

function names(rows: RosterRow[]) {
  return rows.map((r) => r.name);
}

function view(overrides: Partial<RosterView>): RosterView {
  return { ...defaultRosterView, ...overrides };
}

describe("rosterStatus", () => {
  it("is Completed once the enrollment is completed", () => {
    expect(rosterStatus(bob)).toBe(LessonProgressStatus.Completed);
    expect(rosterStatus(row("Z", { completedAt: "2026-01-02" }))).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("is In progress with any progress and no completion", () => {
    expect(rosterStatus(ada)).toBe(LessonProgressStatus.InProgress);
  });

  it("is Not started with no progress", () => {
    expect(rosterStatus(cy)).toBe(LessonProgressStatus.NotStarted);
  });
});

describe("viewRoster", () => {
  it("sorts by name, ignoring case, by default", () => {
    expect(names(viewRoster(roster, defaultRosterView))).toEqual([
      "Ada",
      "bob",
      "Cy",
    ]);
  });

  it("does not reorder the rows it was given", () => {
    viewRoster(roster, defaultRosterView);
    expect(names(roster)).toEqual(["Cy", "bob", "Ada"]);
  });

  it("sorts by name descending", () => {
    expect(names(viewRoster(roster, view({ direction: "desc" })))).toEqual([
      "Cy",
      "bob",
      "Ada",
    ]);
  });

  it("sorts by progress", () => {
    expect(names(viewRoster(roster, view({ sortBy: "progress" })))).toEqual([
      "Cy",
      "Ada",
      "bob",
    ]);
    expect(
      names(viewRoster(roster, view({ sortBy: "progress", direction: "desc" })))
    ).toEqual(["bob", "Ada", "Cy"]);
  });

  it("sorts by enrollment date", () => {
    expect(names(viewRoster(roster, view({ sortBy: "enrolledAt" })))).toEqual([
      "bob",
      "Cy",
      "Ada",
    ]);
  });

  it("breaks ties by name, A to Z whichever the direction", () => {
    const tied = [
      row("Dee", { progress: 50 }),
      row("Al", { progress: 50 }),
      row("Cat", { progress: 10 }),
      row("Bo", { progress: 50 }),
    ];
    expect(
      names(viewRoster(tied, view({ sortBy: "progress", direction: "desc" })))
    ).toEqual(["Al", "Bo", "Dee", "Cat"]);
    expect(names(viewRoster(tied, view({ sortBy: "progress" })))).toEqual([
      "Cat",
      "Al",
      "Bo",
      "Dee",
    ]);
  });

  it("searches names and emails, ignoring case and surrounding spaces", () => {
    expect(names(viewRoster(roster, view({ search: "  ADA " })))).toEqual([
      "Ada",
    ]);
    expect(names(viewRoster(roster, view({ search: "work.dev" })))).toEqual([
      "bob",
    ]);
    expect(names(viewRoster(roster, view({ search: "BOB" })))).toEqual(["bob"]);
    expect(viewRoster(roster, view({ search: "nobody" }))).toEqual([]);
  });

  it("filters by status", () => {
    expect(
      names(
        viewRoster(roster, view({ status: LessonProgressStatus.Completed }))
      )
    ).toEqual(["bob"]);
    expect(
      names(
        viewRoster(roster, view({ status: LessonProgressStatus.InProgress }))
      )
    ).toEqual(["Ada"]);
    expect(
      names(
        viewRoster(roster, view({ status: LessonProgressStatus.NotStarted }))
      )
    ).toEqual(["Cy"]);
  });

  it("combines search and status", () => {
    expect(
      viewRoster(
        roster,
        view({ search: "ada", status: LessonProgressStatus.Completed })
      )
    ).toEqual([]);
  });
});

describe("sortRosterBy", () => {
  it("flips the direction when the column is already the sort", () => {
    const once = sortRosterBy(defaultRosterView, "name");
    expect(once).toMatchObject({ sortBy: "name", direction: "desc" });
    expect(sortRosterBy(once, "name")).toMatchObject({ direction: "asc" });
  });

  it("starts names A to Z, and dates and progress highest first", () => {
    const desc = view({ sortBy: "progress", direction: "desc" });
    expect(sortRosterBy(desc, "name")).toMatchObject({
      sortBy: "name",
      direction: "asc",
    });
    expect(sortRosterBy(defaultRosterView, "progress")).toMatchObject({
      sortBy: "progress",
      direction: "desc",
    });
    expect(sortRosterBy(defaultRosterView, "enrolledAt")).toMatchObject({
      sortBy: "enrolledAt",
      direction: "desc",
    });
  });

  it("keeps the search and the status filter", () => {
    const filtered = view({
      search: "ada",
      status: LessonProgressStatus.InProgress,
    });
    expect(sortRosterBy(filtered, "progress")).toMatchObject({
      search: "ada",
      status: LessonProgressStatus.InProgress,
    });
  });
});
