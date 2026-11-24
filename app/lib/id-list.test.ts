import { describe, expect, it } from "vitest";
import { idListSchema } from "./id-list";

const schema = idListSchema("Missing module IDs.");

function errorOf(input: string) {
  const result = schema.safeParse(input);
  return result.success ? null : result.error.issues[0].message;
}

describe("idListSchema", () => {
  it("reads a JSON array of ids in order", () => {
    expect(schema.parse("[3,1,2]")).toEqual([3, 1, 2]);
  });

  it("refuses an empty field", () => {
    expect(errorOf("")).toBe("Missing module IDs.");
  });

  it("refuses text that is not JSON", () => {
    expect(errorOf("3,1,2")).toBe("Missing module IDs.");
  });

  it("refuses JSON that is not an array", () => {
    expect(errorOf('{"id":3}')).toBe("Missing module IDs.");
  });

  it("reads an empty array as no ids", () => {
    expect(schema.parse("[]")).toEqual([]);
  });

  it("refuses an array holding something other than whole numbers", () => {
    expect(errorOf('["3"]')).toBe("Missing module IDs.");
    expect(errorOf("[1.5]")).toBe("Missing module IDs.");
  });
});
