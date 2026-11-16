import { describe, expect, it } from "vitest";
import {
  POSTING_MAX_LENGTH,
  POSTING_MIN_LENGTH,
  postingFormData,
  postingTextSchema,
} from "./posting";

describe("the pasted posting", () => {
  it("is taken without the whitespace around it", () => {
    const text = "x".repeat(POSTING_MIN_LENGTH);

    expect(postingTextSchema.parse(`\n\n  ${text}  \n`)).toBe(text);
  });

  it("is refused when it is too short to be a posting", () => {
    const result = postingTextSchema.safeParse("x".repeat(POSTING_MIN_LENGTH - 1));

    expect(result.error?.issues[0].message).toBe(
      "That is too short to be a job posting. Paste the whole text.",
    );
  });

  it("does not count whitespace towards the minimum", () => {
    expect(postingTextSchema.safeParse(`short${" ".repeat(POSTING_MIN_LENGTH)}`).success).toBe(
      false,
    );
  });

  it("is refused when it is too long, and not cut to fit", () => {
    expect(postingTextSchema.parse("x".repeat(POSTING_MAX_LENGTH))).toHaveLength(
      POSTING_MAX_LENGTH,
    );

    const result = postingTextSchema.safeParse("x".repeat(POSTING_MAX_LENGTH + 1));

    expect(result.error?.issues[0].message).toBe(
      "That is more than 20,000 characters. Paste only the posting itself.",
    );
  });
});

describe("postingFormData", () => {
  it("reads the field the box posts", () => {
    const data = new FormData();
    data.set("posting", "We are hiring.");

    expect(postingFormData(data)).toBe("We are hiring.");
  });

  it("answers with nothing for a missing field or a file", () => {
    const withFile = new FormData();
    withFile.set("posting", new File(["We are hiring."], "posting.txt"));

    expect(postingFormData(new FormData())).toBe("");
    expect(postingFormData(withFile)).toBe("");
  });
});
