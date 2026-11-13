import { describe, it, expect } from "vitest";
import { preferencesFromKnock } from "./notifications.knock.server";

describe("preferencesFromKnock", () => {
  it("reads each category's feed switch from Knock's preference set", () => {
    const preferences = preferencesFromKnock({
      id: "default",
      categories: {
        "refund-request-updates": { channel_types: { in_app_feed: true } },
        "open-refund-requests": { channel_types: { in_app_feed: false } },
        "seat-claims": false,
        enrollments: { channel_types: { in_app_feed: false } },
        "discussion-questions": true,
        "discussion-replies": { channel_types: { in_app_feed: true } },
      },
    });

    expect(preferences).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: false },
      "seat-claims": { feed: false },
      enrollments: { feed: false },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: true },
    });
  });

  it("reads a missing or malformed category or channel as on, because Knock delivers it", () => {
    const preferences = preferencesFromKnock({
      categories: {
        enrollments: { channel_types: { in_app_feed: false } },
        "seat-claims": { channel_types: { in_app_feed: "no" } },
        "discussion-replies": "off",
        "discussion-questions": { channel_types: null },
      },
    });

    expect(preferences).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: true },
      "seat-claims": { feed: true },
      enrollments: { feed: false },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: true },
    });
  });

  it("reads a set with no categories as no stored preferences", () => {
    expect(preferencesFromKnock({ id: "default", categories: null })).toBeNull();
    expect(preferencesFromKnock({ categories: {} })).toBeNull();
    expect(preferencesFromKnock("not a set")).toBeNull();
  });
});
