import { describe, expect, it } from "vitest";
import { applicationSchema } from "./application";

// Both salary fields share one schema, so testing one covers the other.
const salary = applicationSchema.shape.salaryMin;

describe("the salary field", () => {
  it.each([
    ["45000", 45000],
    ["45.000", 45000],
    ["45,000", 45000],
    ["45 000", 45000],
    ["1.200.000", 1200000],
    [" 45.000 ", 45000],
  ])("reads %j as whole euros", (input, expected) => {
    expect(salary.parse(input)).toBe(expected);
  });

  it("treats an empty field as no value", () => {
    expect(salary.parse("")).toBeUndefined();
    expect(salary.parse("   ")).toBeUndefined();
  });

  it.each(["45.5", "45000.50", "45.000,50", "1.200,000", "4.50.000", "-5", "abc", "1e5"])(
    "refuses %j instead of guessing what was meant",
    (input) => {
      expect(salary.safeParse(input).success).toBe(false);
    },
  );

  it("refuses a number the database column cannot hold", () => {
    expect(salary.parse("2147483647")).toBe(2147483647);
    expect(salary.safeParse("2147483648").success).toBe(false);
  });
});
