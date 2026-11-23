import { describe, expect, it } from "vitest";
import { markdownEditorOptions } from "./markdown-editor-options";

describe("markdownEditorOptions", () => {
  it("hands the wheel back to the page once the editor cannot scroll", () => {
    expect(markdownEditorOptions.scrollbar?.alwaysConsumeMouseWheel).toBe(
      false
    );
  });
});
