import type { ReactNode } from "react";
import {
  isEnter,
  useInlineEdit,
} from "~/components/course-editor/use-inline-edit";

/** A title that turns into a text input when clicked. Enter saves, Escape cancels. */
export function InlineTitleEditor({
  value,
  onSave,
  inputClassName,
  buttonClassName,
  children,
}: {
  value: string;
  onSave: (title: string) => void;
  inputClassName: string;
  buttonClassName: string;
  children: ReactNode;
}) {
  const edit = useInlineEdit<HTMLInputElement>({
    value,
    onSave,
    isSaveKey: isEnter,
  });

  if (edit.isEditing) {
    return (
      <input
        ref={edit.ref}
        type="text"
        value={edit.editValue}
        onChange={(event) => edit.setEditValue(event.target.value)}
        onBlur={edit.save}
        onKeyDown={edit.handleKeyDown}
        className={inputClassName}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={edit.startEditing}
      className={buttonClassName}
    >
      {children}
    </button>
  );
}
