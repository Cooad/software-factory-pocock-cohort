import type * as Monaco from "monaco-editor";
import type { ResolvedTheme } from "~/modules/theme";

const themes: Record<ResolvedTheme, Monaco.editor.IStandaloneThemeData> = {
  dark: {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0a0a0a",
      "editor.foreground": "#e5e5e5",
      "editorLineNumber.foreground": "#525252",
      "editorLineNumber.activeForeground": "#a3a3a3",
      "editor.selectionBackground": "#262626",
      "editor.lineHighlightBackground": "#171717",
      "editorCursor.foreground": "#e5e5e5",
      "editorWidget.background": "#171717",
      "editorWidget.border": "#262626",
      "input.background": "#171717",
      "input.border": "#262626",
      focusBorder: "#525252",
    },
  },
  light: {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#0a0a0a",
      "editorLineNumber.foreground": "#a3a3a3",
      "editorLineNumber.activeForeground": "#525252",
      "editor.selectionBackground": "#e5e5e5",
      "editor.lineHighlightBackground": "#f5f5f5",
      "editorCursor.foreground": "#0a0a0a",
      "editorWidget.background": "#fafafa",
      "editorWidget.border": "#e5e5e5",
      "input.background": "#ffffff",
      "input.border": "#e5e5e5",
      focusBorder: "#a3a3a3",
    },
  },
};

export function monacoThemeName(theme: ResolvedTheme): string {
  return `cadence-${theme}`;
}

export function defineMonacoThemes(monaco: {
  editor: Pick<typeof Monaco.editor, "defineTheme">;
}): void {
  for (const theme of ["light", "dark"] as const) {
    monaco.editor.defineTheme(monacoThemeName(theme), themes[theme]);
  }
}
