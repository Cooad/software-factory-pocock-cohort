import { describe, it, expect } from "vitest";
import type * as Monaco from "monaco-editor";
import {
  defineMonacoThemes,
  monacoThemeName,
} from "./monaco-markdown-editor-themes";

describe("Monaco editor themes", () => {
  it("defines a light and a dark theme under the names the editor asks for", () => {
    const defined = new Map<string, Monaco.editor.IStandaloneThemeData>();
    defineMonacoThemes({
      editor: { defineTheme: (name, data) => void defined.set(name, data) },
    });

    expect(defined.get(monacoThemeName("light"))?.base).toBe("vs");
    expect(defined.get(monacoThemeName("dark"))?.base).toBe("vs-dark");
    expect(
      defined.get(monacoThemeName("light"))?.colors["editor.background"]
    ).toBe("#ffffff");
    expect(
      defined.get(monacoThemeName("dark"))?.colors["editor.background"]
    ).toBe("#0a0a0a");
  });

  it("names the themes apart", () => {
    expect(monacoThemeName("light")).not.toBe(monacoThemeName("dark"));
  });
});
