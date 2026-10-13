import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps a path on this site, including its query", () => {
    expect(safeRedirectPath("/applications/abc123")).toBe("/applications/abc123");
    expect(safeRedirectPath("/applications?view=board")).toBe("/applications?view=board");
  });

  it("falls back to the dashboard when there is nothing usable", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirectPath(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirectPath("")).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirectPath(["/applications"])).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "//[",
  ])("never leaves the site for %j", (input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
