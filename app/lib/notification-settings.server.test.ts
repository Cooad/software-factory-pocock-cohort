import { describe, it, expect, beforeEach } from "vitest";
import { createFakeNotifier, type FakeNotifier } from "./notifications.fake.server";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notification-preferences";
import { getNotificationSettings, savePreference } from "./notification-settings.server";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";

const USER_ID = 7;

let notifier: FakeNotifier;

beforeEach(() => {
  notifier = createFakeNotifier();
});

describe("savePreference", () => {
  it("merges one switch into the stored set and leaves the other categories unchanged", async () => {
    await notifier.setPreferences(USER_ID, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enrollments: { feed: true },
      "seat-claims": { feed: false },
    });

    await savePreference(notifier, USER_ID, "discussion-replies", false);

    expect(await notifier.getPreferences(USER_ID)).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: true },
      "seat-claims": { feed: false },
      enrollments: { feed: true },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: false },
    });
  });
});

describe("savePreference with no stored set", () => {
  it("starts from the defaults, so opting in to Enrollments leaves everything else at its default", async () => {
    await savePreference(notifier, USER_ID, "enrollments", true);

    expect(await notifier.getPreferences(USER_ID)).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: true },
      "seat-claims": { feed: true },
      enrollments: { feed: true },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: true },
    });
  });

  it("fails when the vendor does, so the card can revert the switch", async () => {
    notifier.failWith(new Error("Knock is down"));

    await expect(
      savePreference(notifier, USER_ID, "seat-claims", false)
    ).rejects.toThrow("Knock is down");
  });
});

describe("getNotificationSettings", () => {
  let db: ReturnType<typeof createTestDb>;
  let base: ReturnType<typeof seedBaseData>;

  beforeEach(() => {
    db = createTestDb();
    base = seedBaseData(db);
  });

  function categories(settings: { category: string }[]) {
    return settings.map((s) => s.category);
  }

  it("shows someone with no Purchases, Team Licences or courses only Discussion Replies", async () => {
    const settings = await getNotificationSettings(db, notifier, base.user.id);

    expect(categories(settings)).toEqual(["discussion-replies"]);
  });

  it("shows the Team Admin of a Team Licence Seat claims", async () => {
    const licence = db
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 9800 })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: licence.id,
      })
      .run();

    const settings = await getNotificationSettings(db, notifier, base.user.id);

    expect(categories(settings)).toEqual([
      "refund-request-updates",
      "seat-claims",
      "discussion-replies",
    ]);
  });

  it("shows someone who owns a course Enrollments (off by default) and Discussion Questions", async () => {
    const settings = await getNotificationSettings(db, notifier, base.instructor.id);

    expect(settings).toEqual([
      { category: "enrollments", enabled: false },
      { category: "discussion-questions", enabled: true },
      { category: "discussion-replies", enabled: true },
    ]);
  });

  it("shows a Platform Admin Open Refund Requests", async () => {
    const admin = db
      .insert(schema.users)
      .values({ name: "Admin", email: "admin@example.com", role: schema.UserRole.Admin })
      .returning()
      .get();

    const settings = await getNotificationSettings(db, notifier, admin.id);

    expect(categories(settings)).toEqual([
      "open-refund-requests",
      "discussion-replies",
    ]);
  });

  it("goes by owned courses, not role: an Instructor with no course sees no Instructor switches", async () => {
    const newInstructor = db
      .insert(schema.users)
      .values({ name: "New", email: "new@example.com", role: schema.UserRole.Instructor })
      .returning()
      .get();

    const settings = await getNotificationSettings(db, notifier, newInstructor.id);

    expect(categories(settings)).toEqual(["discussion-replies"]);
  });

  it("shows the stored values, not the defaults, once the person has a set", async () => {
    await notifier.setPreferences(base.instructor.id, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enrollments: { feed: true },
      "discussion-replies": { feed: false },
    });

    const settings = await getNotificationSettings(db, notifier, base.instructor.id);

    expect(settings).toEqual([
      { category: "enrollments", enabled: true },
      { category: "discussion-questions", enabled: true },
      { category: "discussion-replies", enabled: false },
    ]);
  });

  it("shows a buyer Refund Request updates", async () => {
    db.insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 4900 })
      .run();

    const settings = await getNotificationSettings(db, notifier, base.user.id);

    expect(categories(settings)).toEqual([
      "refund-request-updates",
      "discussion-replies",
    ]);
  });
});

describe("muting a category", () => {
  it("keeps that kind out of the feed once the switch is saved off", async () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();
    const now = new Date("2026-10-06T12:00:00.000Z");

    // Discussion Replies is on by default; the Student turns it off.
    await savePreference(notifier, base.user.id, "discussion-replies", false);

    const question = await createComment(
      db, notifier, base.user.id, lesson.id, null, "How do loops work?", now
    );
    await createComment(
      db, notifier, base.instructor.id, lesson.id, question.id, "Like this.", now
    );

    // The reply was sent, but the Student's feed leaves it out...
    expect(notifier.triggers.map((t) => t.kind)).toContain("discussion-reply");
    expect(notifier.feed(base.user.id)).toEqual([]);
    // ...while the Instructor still gets the question (their categories are on).
    expect(notifier.feed(base.instructor.id).map((t) => t.kind)).toEqual([
      "discussion-question",
    ]);
  });
});
