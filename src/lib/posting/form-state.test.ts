import { describe, expect, it } from "vitest";
import type { PostingResult } from "./actions";
import { afterRead } from "./form-state";

function suggestion(id: string): NonNullable<PostingResult["suggestion"]> {
  return {
    id,
    fields: { companyName: "Northwind Systems", role: "", salaryMin: "", salaryMax: "", notes: "" },
    filled: ["company"],
  };
}

describe("afterRead", () => {
  it("takes the first suggestion", () => {
    expect(afterRead({}, { suggestion: suggestion("first") })).toEqual({
      suggestion: suggestion("first"),
    });
  });

  it("replaces an older suggestion with a newer one", () => {
    const held = afterRead(
      { suggestion: suggestion("first") },
      { suggestion: suggestion("second") },
    );

    expect(held.suggestion!.id).toBe("second");
  });

  it("keeps the form as it is when a later read fails, and shows why", () => {
    const held = afterRead(
      { suggestion: suggestion("first") },
      { message: "The posting could not be read. Try again in a moment." },
    );

    expect(held).toEqual({
      message: "The posting could not be read. Try again in a moment.",
      suggestion: suggestion("first"),
    });
  });

  it("drops the message of a failed read once the next one works", () => {
    const held = afterRead({ message: "Try again." }, { suggestion: suggestion("first") });

    expect(held.message).toBeUndefined();
  });
});
