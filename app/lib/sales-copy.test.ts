import { describe, expect, it } from "vitest";
import { describeSalesCopyDraft, normaliseSalesCopy } from "./sales-copy";

describe("normaliseSalesCopy", () => {
  it("drops the whitespace around the copy", () => {
    expect(normaliseSalesCopy("\n  # Learn it  \n\n")).toBe("# Learn it");
  });

  it("keeps the whitespace inside the copy", () => {
    expect(normaliseSalesCopy("one\n\ntwo")).toBe("one\n\ntwo");
  });
});

describe("describeSalesCopyDraft", () => {
  it("has no changes when the draft only adds whitespace to the saved copy", () => {
    expect(describeSalesCopyDraft("  saved copy\n", "saved copy")).toEqual({
      hasChanges: false,
      isEmpty: false,
    });
  });

  it("has changes when the text differs", () => {
    expect(describeSalesCopyDraft("new copy", "saved copy")).toEqual({
      hasChanges: true,
      isEmpty: false,
    });
  });

  it("is empty when the draft is only whitespace", () => {
    expect(describeSalesCopyDraft(" \n ", "saved copy")).toEqual({
      hasChanges: true,
      isEmpty: true,
    });
  });
});
