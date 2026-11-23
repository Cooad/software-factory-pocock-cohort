import { describe, expect, it } from "vitest";
import { describeNoteDraft } from "../index";

describe("describeNoteDraft", () => {
  it("counts the characters against the limit", () => {
    const draft = describeNoteDraft({
      draft: "hello",
      savedBody: null,
      limit: 10,
    });
    expect(draft.characterCount).toBe(5);
    expect(draft.limit).toBe(10);
  });

  it("allows a draft exactly at the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(10),
      savedBody: null,
      limit: 10,
    });
    expect(draft.overLimit).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("refuses to save a draft over the limit", () => {
    const draft = describeNoteDraft({
      draft: "a".repeat(11),
      savedBody: null,
      limit: 10,
    });
    expect(draft.overLimit).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("has no unsaved changes when the draft matches the saved note", () => {
    const draft = describeNoteDraft({
      draft: "same",
      savedBody: "same",
      limit: 10,
    });
    expect(draft.unsavedChanges).toBe(false);
    expect(draft.canSave).toBe(false);
  });

  it("has no unsaved changes for an empty draft and no saved note", () => {
    const draft = describeNoteDraft({ draft: "", savedBody: null, limit: 10 });
    expect(draft.unsavedChanges).toBe(false);
    expect(draft.canSave).toBe(false);
  });

  it("has unsaved changes once the draft differs from the saved note", () => {
    const draft = describeNoteDraft({
      draft: "same!",
      savedBody: "same",
      limit: 10,
    });
    expect(draft.unsavedChanges).toBe(true);
    expect(draft.canSave).toBe(true);
  });

  it("refuses to save a draft that is only whitespace", () => {
    const draft = describeNoteDraft({
      draft: "   \n",
      savedBody: "kept",
      limit: 10,
    });
    expect(draft.unsavedChanges).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("ignores whitespace at the ends, which the server trims away", () => {
    const draft = describeNoteDraft({
      draft: "  kept\n",
      savedBody: "kept",
      limit: 10,
    });
    expect(draft.unsavedChanges).toBe(false);
    expect(draft.canSave).toBe(false);
  });

  it("does not count whitespace at the ends against the limit", () => {
    const draft = describeNoteDraft({
      draft: `  ${"a".repeat(10)}\n`,
      savedBody: null,
      limit: 10,
    });
    expect(draft.characterCount).toBe(10);
    expect(draft.overLimit).toBe(false);
  });
});
