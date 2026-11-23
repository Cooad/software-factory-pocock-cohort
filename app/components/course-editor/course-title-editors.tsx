import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Pencil } from "lucide-react";
import { InlineTitleEditor } from "~/components/course-editor/inline-title-editor";
import { useFetcherToast } from "~/components/course-editor/use-fetcher-toast";
import {
  isModifierEnter,
  useInlineEdit,
} from "~/components/course-editor/use-inline-edit";

export function InlineEditableTitle({ value }: { value: string }) {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Title saved.");

  return (
    <InlineTitleEditor
      value={value}
      onSave={(title) =>
        fetcher.submit({ intent: "update-title", title }, { method: "post" })
      }
      inputClassName="w-full rounded-md border border-input bg-background px-3 py-1.5 text-3xl font-bold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      buttonClassName="group flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left hover:bg-muted"
    >
      <h1 className="flex-1 text-3xl font-bold">{value}</h1>
      <Pencil className="mt-2 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </InlineTitleEditor>
  );
}

function fitToContent(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

export function InlineEditableDescription({ value }: { value: string }) {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Description saved.");
  const edit = useInlineEdit<HTMLTextAreaElement>({
    value,
    onSave: (description) =>
      fetcher.submit(
        { intent: "update-description", description },
        { method: "post" }
      ),
    isSaveKey: isModifierEnter,
  });

  useEffect(() => {
    if (edit.isEditing && edit.ref.current) fitToContent(edit.ref.current);
  }, [edit.isEditing, edit.ref]);

  if (edit.isEditing) {
    return (
      <div>
        <textarea
          ref={edit.ref}
          value={edit.editValue}
          onChange={(event) => {
            edit.setEditValue(event.target.value);
            fitToContent(event.target);
          }}
          onBlur={edit.save}
          onKeyDown={edit.handleKeyDown}
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Press Ctrl+Enter to save, Escape to cancel
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={edit.startEditing}
      className="group flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left hover:bg-muted"
    >
      <p className="flex-1 text-sm text-muted-foreground">{value}</p>
      <Pencil className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
