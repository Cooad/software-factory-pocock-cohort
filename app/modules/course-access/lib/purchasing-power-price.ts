import { getTierForCountry } from "~/lib/ppp";

/**
 * Whether one Individual Purchase Region-Locks its buyer right now: it was
 * made at a Purchasing-Power Price, and the buyer is in a different country
 * than the one it was bought in.
 *
 * Never locks a free course, a course with Purchasing-Power Prices turned off,
 * a Purchase with no recorded country, a full-price Purchase, or a buyer whose
 * current country is unknown.
 */
export function purchaseRegionLocks(
  course: { price: number; pppEnabled: boolean },
  purchaseCountry: string | null,
  currentCountry: string | null
): boolean {
  if (course.price <= 0 || !course.pppEnabled) return false;
  if (!purchaseCountry || !currentCountry) return false;
  if (getTierForCountry(purchaseCountry) === 1) return false;
  return purchaseCountry !== currentCountry;
}
