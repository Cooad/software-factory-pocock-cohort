import type * as Monaco from "monaco-editor";

export const monacoMarkdownEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions =
  {
    minimap: { enabled: false },
    wordWrap: "on",
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    fontSize: 14,
    fontFamily: "ui-monospace, monospace",
    padding: { top: 16, bottom: 16 },
    renderLineHighlight: "line",
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
      alwaysConsumeMouseWheel: false,
    },
    contextmenu: false,
  };
