import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the lesson note editor shows about the text being typed: the
 * character count against the limit, whether it differs from the saved
 * note, and whether Save would be accepted.
 */
export function describeNoteDraft({
  draft,
  savedBody,
  limit,
}: {
  draft: string;
  savedBody: string | null;
  limit: number;
}): NoteDraft {
  return describeDraft(draft, savedBody, limit);
}
