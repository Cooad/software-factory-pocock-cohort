import { describe, expect, it } from "vitest";
import { priceInCentsSchema } from "./price";

function errorOf(input: string) {
  const result = priceInCentsSchema.safeParse(input);
  return result.success ? null : result.error.issues[0].message;
}

describe("priceInCentsSchema", () => {
  it("turns dollars into whole cents", () => {
    expect(priceInCentsSchema.parse("19.99")).toBe(1999);
  });

  it("rounds a fraction of a cent", () => {
    expect(priceInCentsSchema.parse("0.105")).toBe(11);
  });

  it("ignores the whitespace around the price", () => {
    expect(priceInCentsSchema.parse(" 5 ")).toBe(500);
  });

  it("accepts a free course", () => {
    expect(priceInCentsSchema.parse("0")).toBe(0);
  });

  it("accepts the highest price", () => {
    expect(priceInCentsSchema.parse("9999.99")).toBe(999999);
  });

  it("refuses an empty price rather than reading it as free", () => {
    expect(errorOf("")).toBe("Price must be a non-negative number.");
    expect(errorOf("   ")).toBe("Price must be a non-negative number.");
  });

  it("refuses text that is not a number", () => {
    expect(errorOf("abc")).toBe("Price must be a non-negative number.");
  });

  it("refuses a negative price", () => {
    expect(errorOf("-1")).toBe("Price must be a non-negative number.");
  });

  it("refuses a price over $9,999.99", () => {
    expect(errorOf("10000")).toBe("Price cannot exceed $9,999.99.");
  });
});
