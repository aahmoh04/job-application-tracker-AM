import { describe, expect, it } from "vitest";
import { escapeHtml, oneLine } from "./html";

describe("escapeHtml", () => {
  it("turns the five characters that mean something in HTML into entities", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});

describe("oneLine", () => {
  it("folds line breaks and runs of whitespace into single spaces", () => {
    expect(oneLine("  Northwind\r\nBcc: someone@example.com \t ")).toBe(
      "Northwind Bcc: someone@example.com",
    );
  });
});
