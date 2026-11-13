import { describe, expect, it } from "vitest";
import type { FeedNotification, FeedPage } from "./notification-feed";
import {
  feedReducer,
  hasMorePages,
  initialFeedState,
  type FeedState,
} from "./notification-feed-state";

function notification(
  id: string,
  insertedAt: string,
  overrides: Partial<FeedNotification> = {}
): FeedNotification {
  return {
    id,
    kind: "discussion-reply",
    actor: { name: "Ada Lovelace", avatarUrl: null },
    insertedAt,
    seenAt: null,
    readAt: null,
    data: {
      commentId: 42,
      questionId: 7,
      courseSlug: "intro-to-js",
      courseTitle: "Intro to JS",
      lessonId: 3,
      lessonTitle: "Closures",
      snippet: "A closure keeps the scope it was created in.",
    },
    ...overrides,
  } as FeedNotification;
}

function page(
  notifications: FeedNotification[],
  nextCursor: string | null,
  counts = { unseen: 0, unread: 0 }
): FeedPage {
  return { notifications, counts, nextCursor };
}

const ids = (state: FeedState) => state.notifications.map((n) => n.id);

describe("feedReducer: loading pages", () => {
  it("starts empty, not loaded, with more to fetch", () => {
    expect(initialFeedState.notifications).toEqual([]);
    expect(initialFeedState.loaded).toBe(false);
    expect(hasMorePages(initialFeedState)).toBe(true);
  });

  it("shows the first page with its counts", () => {
    const state = feedReducer(initialFeedState, {
      type: "page-loaded",
      page: page(
        [
          notification("b", "2026-10-06T11:00:00.000Z"),
          notification("a", "2026-10-06T10:00:00.000Z"),
        ],
        "cursor-1",
        { unseen: 2, unread: 2 }
      ),
    });

    expect(ids(state)).toEqual(["b", "a"]);
    expect(state.counts).toEqual({ unseen: 2, unread: 2 });
    expect(state.loaded).toBe(true);
    expect(hasMorePages(state)).toBe(true);
  });

  it("adds an older page below the loaded ones, each Notification once, until the last page", () => {
    const first = feedReducer(initialFeedState, {
      type: "page-loaded",
      page: page(
        [
          notification("c", "2026-10-06T12:00:00.000Z"),
          notification("b", "2026-10-06T11:00:00.000Z"),
        ],
        "cursor-1",
        { unseen: 3, unread: 3 }
      ),
    });

    const second = feedReducer(first, {
      type: "page-loaded",
      page: page(
        [
          notification("b", "2026-10-06T11:00:00.000Z"),
          notification("a", "2026-10-06T10:00:00.000Z"),
        ],
        null,
        { unseen: 3, unread: 3 }
      ),
    });

    expect(ids(second)).toEqual(["c", "b", "a"]);
    expect(hasMorePages(second)).toBe(false);
  });
});

describe("feedReducer: live updates", () => {
  it("puts a Notification that arrives live at the top and takes the new counts, keeping the scroll position", () => {
    const loaded = feedReducer(initialFeedState, {
      type: "page-loaded",
      page: page([notification("a", "2026-10-06T10:00:00.000Z")], "cursor-1", {
        unseen: 0,
        unread: 1,
      }),
    });

    const state = feedReducer(loaded, {
      type: "received",
      notifications: [notification("new", "2026-10-06T12:30:00.000Z")],
      counts: { unseen: 1, unread: 2 },
    });

    expect(ids(state)).toEqual(["new", "a"]);
    expect(state.counts).toEqual({ unseen: 1, unread: 2 });
    expect(state.nextCursor).toBe("cursor-1");
  });
});

describe("feedReducer: marking", () => {
  const AT = "2026-10-06T13:00:00.000Z";
  const loaded = feedReducer(initialFeedState, {
    type: "page-loaded",
    page: page(
      [
        notification("c", "2026-10-06T12:00:00.000Z"),
        notification("b", "2026-10-06T11:00:00.000Z"),
        notification("a", "2026-10-06T10:00:00.000Z", {
          seenAt: "2026-10-06T10:30:00.000Z",
          readAt: "2026-10-06T10:30:00.000Z",
        }),
      ],
      "cursor-1",
      { unseen: 2, unread: 5 }
    ),
  });

  it("marks one Notification read, which takes one off the unread count; it stays in the list", () => {
    const state = feedReducer(loaded, { type: "marked-read", id: "b", at: AT });

    expect(ids(state)).toEqual(["c", "b", "a"]);
    expect(state.notifications.map((n) => n.readAt)).toEqual([
      null,
      AT,
      "2026-10-06T10:30:00.000Z",
    ]);
    expect(state.counts).toEqual({ unseen: 2, unread: 4 });
  });

  it("does not count a Notification that is already read twice", () => {
    const state = feedReducer(loaded, { type: "marked-read", id: "a", at: AT });

    expect(state.counts.unread).toBe(5);
    expect(state.notifications[2].readAt).toBe("2026-10-06T10:30:00.000Z");
  });

  it("marks everything read, including Notifications not loaded yet", () => {
    const state = feedReducer(loaded, { type: "marked-all-read", at: AT });

    expect(state.notifications.map((n) => n.readAt)).toEqual([
      AT,
      AT,
      "2026-10-06T10:30:00.000Z",
    ]);
    expect(state.counts).toEqual({ unseen: 2, unread: 0 });
  });

  it("marks everything seen, which clears the badge but leaves them unread", () => {
    const state = feedReducer(loaded, { type: "marked-all-seen", at: AT });

    expect(state.notifications.map((n) => n.seenAt)).toEqual([
      AT,
      AT,
      "2026-10-06T10:30:00.000Z",
    ]);
    expect(state.notifications.map((n) => n.readAt)).toEqual([
      null,
      null,
      "2026-10-06T10:30:00.000Z",
    ]);
    expect(state.counts).toEqual({ unseen: 0, unread: 5 });
  });
});
