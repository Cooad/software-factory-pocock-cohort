import { describe, expect, it } from "vitest";
import { monacoMarkdownEditorOptions } from "./monaco-markdown-editor-options";

describe("monacoMarkdownEditorOptions", () => {
  it("hands the wheel back to the page once the editor cannot scroll", () => {
    expect(monacoMarkdownEditorOptions.scrollbar?.alwaysConsumeMouseWheel).toBe(
      false
    );
  });
});
