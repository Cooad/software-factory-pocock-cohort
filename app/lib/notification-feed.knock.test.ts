import { describe, it, expect } from "vitest";
import { parseFeedPage, toNotifications } from "./notification-feed.knock";

// What Knock's feed API sends, trimmed to the fields Cadence reads.
function knockItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    source: { key: "discussion-reply" },
    actors: [{ id: "2", name: "Ada Lovelace", avatar: "https://a.test/ada.png" }],
    data: {
      commentId: 12,
      questionId: 10,
      courseSlug: "js-101",
      courseTitle: "JavaScript 101",
      lessonId: 3,
      lessonTitle: "Closures",
      snippet: "A closure keeps the scope.",
      url: "/courses/js-101/lessons/3#comment-12",
    },
    inserted_at: "2026-11-13T10:00:00.000Z",
    seen_at: null,
    read_at: null,
    ...overrides,
  };
}

describe("toNotifications", () => {
  it("turns a Knock feed item into a Cadence Notification", () => {
    expect(toNotifications([knockItem()])).toEqual([
      {
        id: "msg_1",
        kind: "discussion-reply",
        actor: { name: "Ada Lovelace", avatarUrl: "https://a.test/ada.png" },
        data: {
          commentId: 12,
          questionId: 10,
          courseSlug: "js-101",
          courseTitle: "JavaScript 101",
          lessonId: 3,
          lessonTitle: "Closures",
          snippet: "A closure keeps the scope.",
        },
        insertedAt: "2026-11-13T10:00:00.000Z",
        seenAt: null,
        readAt: null,
      },
    ]);
  });

  it("reads an item with no actors as sent by Cadence", () => {
    const item = knockItem({
      source: { key: "refund-request-confirmation" },
      actors: [],
      data: {
        refundRequestId: 1,
        purchaseId: 2,
        courseSlug: "js-101",
        courseTitle: "JavaScript 101",
        amount: 4900,
      },
    });

    expect(toNotifications([item])[0]).toMatchObject({
      kind: "refund-request-confirmation",
      actor: null,
    });
  });

  it("drops items whose data doesn't fit their kind, and keeps the rest", () => {
    const broken = knockItem({ id: "msg_bad", data: { commentId: "12" } });
    const good = knockItem({ id: "msg_good" });

    expect(toNotifications([broken, good]).map((n) => n.id)).toEqual([
      "msg_good",
    ]);
  });

  it("drops items from workflows Cadence doesn't know, and items that aren't items", () => {
    const unknown = knockItem({ source: { key: "prototype-feed" } });

    expect(toNotifications([unknown, null, { id: 5 }])).toEqual([]);
  });
});

describe("parseFeedPage", () => {
  it("reads the Notifications, counts and next cursor from a feed response", () => {
    const page = parseFeedPage({
      entries: [knockItem(), knockItem({ id: "msg_bad", data: {} })],
      meta: { unseen_count: 3, unread_count: 4, total_count: 9 },
      page_info: { after: "cursor_2", before: null, page_size: 20 },
    });

    expect(page.notifications.map((n) => n.id)).toEqual(["msg_1"]);
    expect(page.counts).toEqual({ unseen: 3, unread: 4 });
    expect(page.nextCursor).toBe("cursor_2");
  });

  it("has no next cursor on the last page", () => {
    const page = parseFeedPage({
      entries: [],
      meta: { unseen_count: 0, unread_count: 0 },
      page_info: { after: null },
    });

    expect(page.nextCursor).toBeNull();
  });

  it("fails on a response that isn't a feed page", () => {
    expect(() => parseFeedPage({ error: "nope" })).toThrow();
  });
});
