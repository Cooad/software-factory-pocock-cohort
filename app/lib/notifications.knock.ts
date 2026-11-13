import type { NotificationKind } from "~/lib/notifications";
import type { PreferenceCategory } from "~/lib/notification-preferences";

// ─── Notifications: Knock's names for Cadence's ───
// Shared by the Knock server adapter (`notifications.knock.server.ts`) and the
// Knock client adapter (`notification-feed.knock.ts`), so each kind's workflow
// key is written once. Must match the folders in `knock/workflows/`
// (`knock-workflows.test.ts` checks that).

/** Notification kind → Knock workflow key. */
export const WORKFLOW_KEY_BY_KIND: Record<NotificationKind, string> = {
  "discussion-reply": "discussion-reply",
  "discussion-question": "discussion-question",
  "seat-claimed": "seat-claimed",
  "new-enrollment": "new-enrollment",
  "refund-request-confirmation": "refund-request-confirmation",
  "open-refund-request": "open-refund-request",
  "refund-request-approved": "refund-request-approved",
  "refund-request-declined": "refund-request-declined",
};

/** Cadence preference category → Knock category key. */
export const KNOCK_CATEGORY_KEY: Record<PreferenceCategory, string> = {
  "refund-request-updates": "refund-request-updates",
  "open-refund-requests": "open-refund-requests",
  "seat-claims": "seat-claims",
  enrollments: "enrollments",
  "discussion-questions": "discussion-questions",
  "discussion-replies": "discussion-replies",
};

function isNotificationKind(key: string): key is NotificationKind {
  return Object.hasOwn(WORKFLOW_KEY_BY_KIND, key);
}

const KIND_BY_WORKFLOW = new Map(
  Object.keys(WORKFLOW_KEY_BY_KIND)
    .filter(isNotificationKind)
    .map((kind) => [WORKFLOW_KEY_BY_KIND[kind], kind] as const)
);

/** The Notification kind a Knock workflow sends, or undefined if none does. */
export function kindForWorkflow(workflowKey: string): NotificationKind | undefined {
  return KIND_BY_WORKFLOW.get(workflowKey);
}
