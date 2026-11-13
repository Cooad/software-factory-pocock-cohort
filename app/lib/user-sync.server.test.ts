import { describe, it, expect, beforeEach } from "vitest";
import { createFakeNotifier, type FakeNotifier } from "./notifications.fake.server";
import { syncUser } from "./notifications.server";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notification-preferences";
import { adminUpdateUser, signUp, syncAllUsers, updateOwnProfile, type User } from "./users.server";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";

const ADA = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
};

let notifier: FakeNotifier;

beforeEach(() => {
  notifier = createFakeNotifier();
});

describe("syncUser", () => {
  it("identifies the user by name, email and avatar", async () => {
    await syncUser(notifier, ADA);

    expect(notifier.identifiedUsers).toEqual([ADA]);
  });

  it("gives a user with no preferences the defaults: Enrollments off, everything else on", async () => {
    await syncUser(notifier, ADA);

    expect(await notifier.getPreferences(ADA.id)).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: true },
      "seat-claims": { feed: true },
      enrollments: { feed: false },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: true },
    });
  });

  it("leaves a user's existing preferences untouched", async () => {
    const muted = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enrollments: { feed: true },
      "discussion-replies": { feed: false },
    };
    await notifier.setPreferences(ADA.id, muted);
    notifier.preferenceWrites.length = 0;

    await syncUser(notifier, ADA);

    expect(notifier.preferenceWrites).toEqual([]);
    expect(await notifier.getPreferences(ADA.id)).toEqual(muted);
    expect(notifier.identifiedUsers).toEqual([ADA]);
  });

  it("is safe to run again", async () => {
    await syncUser(notifier, ADA);
    await syncUser(notifier, { ...ADA, name: "Ada King" });

    expect(notifier.preferenceWrites).toHaveLength(1);
    expect(notifier.identifiedUsers.map((u) => u.name)).toEqual([
      "Ada Lovelace",
      "Ada King",
    ]);
  });
});

describe("signUp", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates a Student and syncs them with the default preferences", async () => {
    const { user, created } = await signUp(db, notifier, "Grace Hopper", "grace@example.com");

    expect(created).toBe(true);
    expect(user).toMatchObject({ name: "Grace Hopper", email: "grace@example.com", role: UserRole.Student });
    expect(notifier.identifiedUsers).toEqual([
      { id: user.id, name: "Grace Hopper", email: "grace@example.com", avatarUrl: null },
    ]);
    expect(await notifier.getPreferences(user.id)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("signs in an existing email without creating or syncing anyone", async () => {
    const first = await signUp(db, notifier, "Grace Hopper", "grace@example.com");
    notifier.identifiedUsers.length = 0;

    const again = await signUp(db, notifier, "Someone Else", "grace@example.com");

    expect(again).toEqual({ user: first.user, created: false });
    expect(notifier.identifiedUsers).toEqual([]);
  });

  it("still creates the user when sync fails", async () => {
    notifier.failWith(new Error("Knock is down"));

    const { user, created } = await signUp(db, notifier, "Grace Hopper", "grace@example.com");

    expect(created).toBe(true);
    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()).toBeDefined();
  });
});

describe("updateOwnProfile", () => {
  let db: ReturnType<typeof createTestDb>;
  let user: User;

  beforeEach(async () => {
    db = createTestDb();
    user = seedBaseData(db).user;
  });

  it("syncs the user under their new name when they rename themselves", async () => {
    const updated = await updateOwnProfile(db, notifier, user.id, "Renamed User", "Hi");

    expect(updated).toMatchObject({ name: "Renamed User", bio: "Hi" });
    expect(notifier.identifiedUsers).toEqual([
      { id: user.id, name: "Renamed User", email: user.email, avatarUrl: user.avatarUrl },
    ]);
  });

  it("doesn't sync when only the bio changes", async () => {
    await updateOwnProfile(db, notifier, user.id, user.name, "New bio");

    expect(notifier.identifiedUsers).toEqual([]);
  });

  it("still saves the profile when sync fails", async () => {
    notifier.failWith(new Error("Knock is down"));

    await updateOwnProfile(db, notifier, user.id, "Renamed User", null);

    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()?.name).toBe(
      "Renamed User"
    );
  });
});

describe("adminUpdateUser", () => {
  let db: ReturnType<typeof createTestDb>;
  let user: User;

  beforeEach(async () => {
    db = createTestDb();
    user = seedBaseData(db).user;
  });

  it("syncs the edited user's new name and email", async () => {
    const updated = await adminUpdateUser(db, notifier, user.id, "Edited Name", "edited@example.com");

    expect(updated).toMatchObject({ name: "Edited Name", email: "edited@example.com" });
    expect(notifier.identifiedUsers).toEqual([
      { id: user.id, name: "Edited Name", email: "edited@example.com", avatarUrl: user.avatarUrl },
    ]);
  });

  it("still saves the edit when sync fails", async () => {
    notifier.failWith(new Error("Knock is down"));

    await adminUpdateUser(db, notifier, user.id, "Edited Name", "edited@example.com");

    expect(db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()).toMatchObject({
      name: "Edited Name",
      email: "edited@example.com",
    });
  });
});

describe("syncAllUsers (seed and backfill)", () => {
  let db: ReturnType<typeof createTestDb>;
  let base: ReturnType<typeof seedBaseData>;

  beforeEach(() => {
    db = createTestDb();
    base = seedBaseData(db);
  });

  it("syncs every user, giving defaults only to those without preferences", async () => {
    const custom = { ...DEFAULT_NOTIFICATION_PREFERENCES, enrollments: { feed: true } };
    await notifier.setPreferences(base.instructor.id, custom);

    const result = await syncAllUsers(db, notifier);

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(notifier.identifiedUsers.map((u) => u.id).sort()).toEqual(
      [base.user.id, base.instructor.id].sort()
    );
    expect(await notifier.getPreferences(base.user.id)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(await notifier.getPreferences(base.instructor.id)).toEqual(custom);
  });

  it("counts failures instead of stopping", async () => {
    notifier.failWith(new Error("Knock is down"));

    expect(await syncAllUsers(db, notifier)).toEqual({ synced: 0, failed: 2 });
  });
});
