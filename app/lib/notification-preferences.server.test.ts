import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createTestDb,
  createUserWithRole,
  seedBaseData,
} from "~/test/setup";
import * as schema from "~/db/schema";
import {
  getFeedPreferences,
  setFeedPreference,
  visibleNotificationCategories,
  syncAllUsers,
  syncUser,
} from "./notification-preferences.server";
import { createCourse } from "./courses.server";
import {
  createIndividualPurchase,
  createTeamLicence,
} from "./purchases.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifications: FakeNotifications;

beforeEach(() => {
  notifications = fakeNotifications();
  db = createTestDb();
  base = seedBaseData(db);
});

function person(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

describe("syncing a user", () => {
  it("sends their name, email and avatar", async () => {
    await syncUser(notifications, {
      id: 7,
      name: "Ada",
      email: "ada@example.com",
      avatarUrl: "https://example.com/ada.png",
    });

    expect(notifications.users.get(7)).toEqual({
      id: 7,
      name: "Ada",
      email: "ada@example.com",
      avatarUrl: "https://example.com/ada.png",
    });
  });

  it("writes the default preferences for a user with none: Enrollments off, everything else on", async () => {
    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: false },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("writes the default preferences for a user whose set is empty", async () => {
    await notifications.mergePreferences(base.user.id, {});

    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toMatchObject({
      enrollments: { feed: false },
      discussionReplies: { feed: true },
    });
  });

  it("leaves an existing preference set alone", async () => {
    await notifications.mergePreferences(base.user.id, {
      discussionReplies: { feed: false },
      enrollments: { feed: true },
    });

    await syncUser(notifications, person(base.user));

    expect(notifications.preferences.get(base.user.id)).toEqual({
      discussionReplies: { feed: false },
      enrollments: { feed: true },
    });
  });

  it("logs a failed sync instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    await expect(
      syncUser(notifications, person(base.user))
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(`sync user ${base.user.id}`),
      "Knock is down"
    );
    error.mockRestore();
  });
});

describe("syncing every user", () => {
  it("syncs each user in the database and reports how many", async () => {
    const count = await syncAllUsers(db, notifications);

    expect(count).toBe(2);
    expect([...notifications.users.keys()].sort()).toEqual(
      [base.user.id, base.instructor.id].sort()
    );
    expect(notifications.preferences.get(base.instructor.id)).toMatchObject({
      enrollments: { feed: false },
    });
  });
});

describe("changing a feed preference", () => {
  it("merges the change into the existing set, leaving every other preference unchanged", async () => {
    await notifications.mergePreferences(base.user.id, {
      refundRequestUpdates: { feed: false },
      enrollments: { feed: true },
      discussionReplies: { feed: true },
    });

    await setFeedPreference(
      notifications,
      base.user.id,
      "discussionReplies",
      false
    );

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: false },
      enrollments: { feed: true },
      discussionReplies: { feed: false },
    });
  });

  it("starts from the defaults when the user has no set yet", async () => {
    await setFeedPreference(notifications, base.user.id, "enrollments", true);

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: true },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("starts from the defaults when the user's set is empty", async () => {
    await notifications.mergePreferences(base.user.id, {});

    await setFeedPreference(notifications, base.user.id, "enrollments", true);

    expect(notifications.preferences.get(base.user.id)).toEqual({
      refundRequestUpdates: { feed: true },
      seatClaims: { feed: true },
      enrollments: { feed: true },
      discussionQuestions: { feed: true },
      openRefundRequests: { feed: true },
      discussionReplies: { feed: true },
    });
  });

  it("is read back as each category's feed switch, with defaults for missing ones", async () => {
    await notifications.mergePreferences(base.user.id, {
      discussionReplies: { feed: false },
    });

    expect(await getFeedPreferences(notifications, base.user.id)).toEqual({
      refundRequestUpdates: true,
      seatClaims: true,
      enrollments: false,
      discussionQuestions: true,
      openRefundRequests: true,
      discussionReplies: false,
    });
  });
});

describe("which switches a person sees", () => {
  const NOW = new Date(2026, 9, 6, 12, 0, 0);

  function buyIndividually(userId: number) {
    return createIndividualPurchase(db, userId, base.course.id, 4900, null, NOW);
  }

  function buyTeamLicence(userId: number) {
    createTeamLicence(db, userId, base.course.id, 4900, null, 1, NOW);
  }

  function addUser(name: string, role: schema.UserRole) {
    return createUserWithRole(db, name, `${name}@example.com`, role);
  }

  it("shows a Student with nothing only Discussion Replies", () => {
    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "discussionReplies",
    ]);
  });

  it("adds Refund Request updates once they have a Purchase", () => {
    buyIndividually(base.user.id);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refundRequestUpdates",
      "discussionReplies",
    ]);
  });

  it("adds Seat claims for a Team Admin on a Team Licence", () => {
    buyTeamLicence(base.user.id);

    expect(visibleNotificationCategories(db, base.user.id)).toEqual([
      "refundRequestUpdates",
      "seatClaims",
      "discussionReplies",
    ]);
  });

  it("adds Enrollments and Discussion Questions for someone who owns a course", () => {
    expect(visibleNotificationCategories(db, base.instructor.id)).toEqual([
      "enrollments",
      "discussionQuestions",
      "discussionReplies",
    ]);
  });

  it("hides Enrollments and Discussion Questions from an Instructor who owns no course", () => {
    const instructor = addUser("Ines", schema.UserRole.Instructor);

    expect(visibleNotificationCategories(db, instructor.id)).toEqual([
      "discussionReplies",
    ]);
  });

  it("treats a Platform Admin who owns a course as an Instructor too", () => {
    const admin = addUser("Alex", schema.UserRole.Admin);
    createCourse(
      db,
      "Admin Course",
      "admin-course",
      "A course a Platform Admin owns",
      "## Admin Course",
      admin.id,
      base.category.id,
      null
    );

    expect(visibleNotificationCategories(db, admin.id)).toEqual([
      "enrollments",
      "discussionQuestions",
      "openRefundRequests",
      "discussionReplies",
    ]);
  });

  it("adds Open Refund Requests for a Platform Admin", () => {
    const admin = addUser("Alex", schema.UserRole.Admin);

    expect(visibleNotificationCategories(db, admin.id)).toEqual([
      "openRefundRequests",
      "discussionReplies",
    ]);
  });
});
