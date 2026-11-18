// Kept apart from refunds.server.ts so pages can show these rules without
// pulling the database into the client bundle.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RuleBreak =
  | "window_closed"
  | "watched_too_much"
  | "completed_too_much"
  | "seat_claimed";

export const RULE_BREAK_LABELS: Record<RuleBreak, string> = {
  window_closed: `Raised outside the ${REFUND_WINDOW_DAYS}-day window`,
  watched_too_much: `Watched ${REFUND_WATCH_LIMIT_SECONDS / 3600} hours or more`,
  completed_too_much: `Completed ${REFUND_COMPLETION_LIMIT * 100}% of lessons or more`,
  seat_claimed: "A Seat has been claimed",
};
