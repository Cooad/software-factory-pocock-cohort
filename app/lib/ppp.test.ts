import { describe, it, expect } from "vitest";
import {
  getTierForCountry,
  getDiscountForCountry,
  calculatePppPrice,
  getCountryTierInfo,
} from "./ppp";

describe("PPP Config", () => {
  // ─── Tier Mapping ───

  describe("getTierForCountry", () => {
    it("returns tier 1 for US", () => {
      expect(getTierForCountry("US")).toBe(1);
    });

    it("returns tier 2 for Poland", () => {
      expect(getTierForCountry("PL")).toBe(2);
    });

    it("returns tier 3 for India", () => {
      expect(getTierForCountry("IN")).toBe(3);
    });

    it("returns tier 4 for Nigeria", () => {
      expect(getTierForCountry("NG")).toBe(4);
    });

    it("returns tier 1 for unmapped countries", () => {
      expect(getTierForCountry("XX")).toBe(1);
      expect(getTierForCountry("ZZ")).toBe(1);
    });

    it("returns tier 1 for null", () => {
      expect(getTierForCountry(null)).toBe(1);
    });

    it("is case-insensitive", () => {
      expect(getTierForCountry("in")).toBe(3);
      expect(getTierForCountry("Us")).toBe(1);
    });
  });

  // ─── Discount ───

  describe("getDiscountForCountry", () => {
    it("returns 0 for tier 1 countries", () => {
      expect(getDiscountForCountry("US")).toBe(0);
    });

    it("returns 0.3 for tier 2 countries", () => {
      expect(getDiscountForCountry("BR")).toBe(0.3);
    });

    it("returns 0.5 for tier 3 countries", () => {
      expect(getDiscountForCountry("IN")).toBe(0.5);
    });

    it("returns 0.7 for tier 4 countries", () => {
      expect(getDiscountForCountry("NG")).toBe(0.7);
    });

    it("returns 0 for null country", () => {
      expect(getDiscountForCountry(null)).toBe(0);
    });
  });

  // ─── Price Calculation ───

  describe("calculatePppPrice", () => {
    it("returns full price for tier 1", () => {
      expect(calculatePppPrice(4999, "US")).toBe(4999);
    });

    it("applies 30% discount for tier 2", () => {
      expect(calculatePppPrice(4999, "BR")).toBe(3499);
    });

    it("applies 50% discount for tier 3", () => {
      expect(calculatePppPrice(4999, "IN")).toBe(2500);
    });

    it("applies 70% discount for tier 4", () => {
      expect(calculatePppPrice(4999, "NG")).toBe(1500);
    });

    it("returns 0 for free courses", () => {
      expect(calculatePppPrice(0, "IN")).toBe(0);
    });

    it("returns full price for null country", () => {
      expect(calculatePppPrice(4999, null)).toBe(4999);
    });
  });

  // ─── Tier Info ───

  describe("getCountryTierInfo", () => {
    it("returns tier, discount, and label", () => {
      const info = getCountryTierInfo("IN");
      expect(info).toEqual({ tier: 3, discount: 0.5, label: "50% off" });
    });

    it("returns full price info for null", () => {
      const info = getCountryTierInfo(null);
      expect(info).toEqual({ tier: 1, discount: 0, label: "Full Price" });
    });
  });
});
