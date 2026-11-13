import { describe, expect, it } from "vitest";
import type { FeedNotification } from "./notification-feed";
import { presentNotification } from "./notification-presenter";

const NOW = new Date("2026-10-06T12:00:00.000Z");

function discussionReply(
  overrides: Partial<FeedNotification> = {}
): FeedNotification {
  return {
    id: "msg_1",
    kind: "discussion-reply",
    actor: { name: "Ada Lovelace", avatarUrl: "https://example.com/ada.png" },
    insertedAt: "2026-10-06T11:55:00.000Z",
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

describe("presentNotification: Discussion Reply", () => {
  it("names the sender and the lesson, and quotes the reply", () => {
    const row = presentNotification(discussionReply(), NOW);

    expect(row).toMatchObject({
      id: "msg_1",
      title: "Ada Lovelace replied to your question in Closures",
      snippet: "“A closure keeps the scope it was created in.”",
      categoryIcon: "discussion",
      avatar: {
        kind: "sender",
        name: "Ada Lovelace",
        avatarUrl: "https://example.com/ada.png",
      },
      unread: true,
      timeAgo: "5m",
    });
  });

  it("links to the reply itself on the lesson", () => {
    const row = presentNotification(discussionReply(), NOW);

    expect(row.href).toBe("/courses/intro-to-js/lessons/3#comment-42");
  });

  it("is read once Knock has a read time", () => {
    const row = presentNotification(
      discussionReply({ readAt: "2026-10-06T11:58:00.000Z" }),
      NOW
    );

    expect(row.unread).toBe(false);
  });

  it("calls a sender with no name Someone", () => {
    const row = presentNotification(discussionReply({ actor: null }), NOW);

    expect(row.title).toBe("Someone replied to your question in Closures");
  });
});

describe("presentNotification: relative time", () => {
  it.each([
    ["2026-10-06T11:59:40.000Z", "just now"],
    ["2026-10-06T09:00:00.000Z", "3h"],
    ["2026-10-04T12:00:00.000Z", "2d"],
  ])("shows %s as %s", (insertedAt, expected) => {
    const row = presentNotification(discussionReply({ insertedAt }), NOW);

    expect(row.timeAgo).toBe(expected);
  });
});

function seatClaimed(
  seatsLeft: number,
  overrides: Partial<FeedNotification> = {}
): FeedNotification {
  return {
    id: "msg_4",
    kind: "seat-claimed",
    actor: { name: "Ben Student", avatarUrl: "https://example.com/ben.png" },
    insertedAt: "2026-10-06T10:00:00.000Z",
    seenAt: null,
    readAt: null,
    data: {
      seatId: 12,
      purchaseId: 5,
      courseSlug: "intro-to-js",
      courseTitle: "Intro to JS",
      seatsLeft,
    },
    ...overrides,
  } as FeedNotification;
}

describe("presentNotification: Seat claimed", () => {
  it("says who claimed a Seat on which course, from the claiming Student, with the Team icon", () => {
    const row = presentNotification(seatClaimed(3), NOW);

    expect(row).toMatchObject({
      id: "msg_4",
      title: "Ben Student claimed a Seat on Intro to JS",
      snippet: "3 Seats left",
      categoryIcon: "team",
      avatar: {
        kind: "sender",
        name: "Ben Student",
        avatarUrl: "https://example.com/ben.png",
      },
      unread: true,
      timeAgo: "2h",
    });
  });

  it("counts the Seats left in plain words", () => {
    expect(presentNotification(seatClaimed(1), NOW).snippet).toBe(
      "1 Seat left"
    );
    expect(presentNotification(seatClaimed(0), NOW).snippet).toBe(
      "No Seats left"
    );
  });

  it("links to the Team page", () => {
    expect(presentNotification(seatClaimed(3), NOW).href).toBe("/team");
  });
});
