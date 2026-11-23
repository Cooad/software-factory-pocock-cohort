import {
  useRef,
  useCallback,
  useState,
  useEffect,
  type ComponentType,
} from "react";
import type { BeforeMount, EditorProps, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { monacoMarkdownEditorOptions } from "~/components/monaco-markdown-editor-options";
import {
  defineMonacoThemes,
  monacoThemeName,
} from "~/components/monaco-markdown-editor-themes";
import { useTheme } from "~/modules/theme/use-theme";

const handleBeforeMount: BeforeMount = (monaco) => defineMonacoThemes(monaco);

type MonacoMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
};

export function MonacoMarkdownEditor({
  value,
  onChange,
  onSave,
}: MonacoMarkdownEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const { resolved: theme } = useTheme();
  const [Editor, setEditor] = useState<ComponentType<EditorProps> | null>(null);

  useEffect(() => {
    import("@monaco-editor/react").then((mod) => {
      setEditor(() => mod.default);
    });
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Register Prettier as Monaco's native document formatter for Markdown
    monaco.languages.registerDocumentFormattingEditProvider("markdown", {
      provideDocumentFormattingEdits: async (
        model: Monaco.editor.ITextModel
      ) => {
        try {
          const [prettier, markdownPlugin] = await Promise.all([
            import("prettier/standalone"),
            import("prettier/plugins/markdown"),
          ]);
          const formatted = await prettier.format(model.getValue(), {
            parser: "markdown",
            plugins: [markdownPlugin.default],
            proseWrap: "preserve",
            tabWidth: 2,
          });
          return [
            {
              text: formatted,
              range: model.getFullModelRange(),
            },
          ];
        } catch {
          return [];
        }
      },
    });

    // Ctrl+S / Cmd+S to format with Prettier then save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const formatAction = editor.getAction("editor.action.formatDocument");
      if (formatAction) {
        await formatAction.run();
        onChangeRef.current(editor.getValue());
      }
      onSaveRef.current?.();
    });
  }, []);

  if (!Editor) {
    return (
      <div
        className="overflow-hidden rounded-md border border-input"
        style={{ height: "500px" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-input">
      <Editor
        height="500px"
        defaultLanguage="markdown"
        defaultValue={value}
        onChange={(v) => onChange(v ?? "")}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        theme={monacoThemeName(theme)}
        options={monacoMarkdownEditorOptions}
      />
    </div>
  );
}
