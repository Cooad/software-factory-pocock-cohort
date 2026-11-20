export type NoteDraft = {
  characterCount: number;
  limit: number;
  overLimit: boolean;
  unsavedChanges: boolean;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string | null,
  limit: number
): NoteDraft {
  // The server trims a note before it checks the length and stores it, so
  // whitespace at either end neither counts nor is a change anyone could save.
  const trimmed = draft.trim();
  const characterCount = trimmed.length;
  const overLimit = characterCount > limit;
  const unsavedChanges = trimmed !== (savedBody ?? "");
  const blank = trimmed.length === 0;

  return {
    characterCount,
    limit,
    overLimit,
    unsavedChanges,
    canSave: unsavedChanges && !overLimit && !blank,
  };
}
