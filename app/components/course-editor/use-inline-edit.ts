import { useEffect, useRef, useState } from "react";

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

export function isEnter(event: React.KeyboardEvent) {
  return event.key === "Enter";
}

export function isModifierEnter(event: React.KeyboardEvent) {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

/**
 * The draft of a click-to-edit field. Saving trims the draft and calls
 * `onSave` only when it is non-empty and differs from `value`.
 */
export function useInlineEdit<Element extends EditableElement>({
  value,
  onSave,
  isSaveKey,
}: {
  value: string;
  onSave: (trimmed: string) => void;
  isSaveKey: (event: React.KeyboardEvent) => boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const ref = useRef<Element>(null);

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  function save() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setIsEditing(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (isSaveKey(event)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  }

  return {
    ref,
    isEditing,
    startEditing: () => setIsEditing(true),
    editValue,
    setEditValue,
    save,
    handleKeyDown,
  };
}
