/**
 * The sales copy as the server stores it. The editor calls this too, so
 * "unsaved changes" compares like with like.
 */
export function normaliseSalesCopy(text: string) {
  return text.trim();
}

/** What the editor shows about a draft against the saved sales copy. */
export function describeSalesCopyDraft(draft: string, saved: string) {
  const normalised = normaliseSalesCopy(draft);
  return {
    hasChanges: normalised !== saved,
    isEmpty: normalised.length === 0,
  };
}
