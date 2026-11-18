// Imported by both the service and the route, so nothing here may touch the
// database or the request.

/**
 * One constant, named once — the page shows gross, fee and net side by side,
 * and they must agree.
 */
export const PLATFORM_FEE_RATE = 0.2;

export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_RATE * 100;

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return ANALYTICS_RANGES.some((range) => range.value === value)
    ? (value as AnalyticsRange)
    : DEFAULT_ANALYTICS_RANGE;
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * The boundary is decided in exactly one place: a row landing exactly on the
 * cutoff is inside the range. Lives here rather than in the service because
 * panels built on other services have to agree with it.
 */
export function rangeStart(range: AnalyticsRange): string | null {
  if (range === "all") return null;
  return new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Deliberately not `formatPrice`, which renders 0 as "Free": a day with no
 * sales is $0.00, not free.
 */
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * A chart axis label for a `YYYY-MM-DD` or `YYYY-MM` bucket.
 *
 * Formatted by slicing the string rather than by constructing a Date, so the
 * server and the browser cannot disagree about the timezone and trip
 * hydration.
 */
export function formatBucket(bucket: string): string {
  const month = MONTHS[Number(bucket.slice(5, 7)) - 1] ?? "";
  const day = bucket.slice(8, 10);
  return day ? `${Number(day)} ${month}` : `${month} ${bucket.slice(2, 4)}`;
}

/**
 * Net is gross minus the rounded fee rather than a second independent
 * rounding, so the three figures always add up on screen.
 */
export function splitRevenue(grossCents: number) {
  const feeCents = Math.round(grossCents * PLATFORM_FEE_RATE);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}
