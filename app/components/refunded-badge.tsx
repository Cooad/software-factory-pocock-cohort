/**
 * Marks a learner who has no Active Enrollment in the course because their
 * Refund Request was approved. It reflects who they are now: it disappears
 * if they buy the course again.
 */
export function RefundedBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      title="This learner was refunded and is no longer on the course"
    >
      Refunded
    </span>
  );
}
