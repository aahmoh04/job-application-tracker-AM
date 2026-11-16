import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXTRACTION_VERSION, extractionSchema, INSTRUCTIONS, postingMessage } from "./extraction";

/** What a model returns for a posting that states everything. */
const ANSWER = {
  isJobPosting: true,
  company: "Northwind Systems GmbH",
  role: "Junior Developer",
  location: "Stuttgart, hybrid",
  salaryMin: 48000,
  salaryMax: 55000,
  applyBy: "2026-11-30",
  requirements: ["TypeScript", "React"],
};

describe("the schema for a model's answer", () => {
  it("accepts an answer that found everything", () => {
    expect(extractionSchema.parse(ANSWER)).toEqual(ANSWER);
  });

  it("accepts an answer that found nothing, because null is the honest answer to a gap", () => {
    const nothing = {
      isJobPosting: false,
      company: null,
      role: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      applyBy: null,
      requirements: [],
    };

    expect(extractionSchema.parse(nothing)).toEqual(nothing);
  });

  it.each([
    ["that leaves a field out", { ...ANSWER, company: undefined }],
    ["with a salary written as text", { ...ANSWER, salaryMin: "48.000" }],
    ["with half a euro in the salary", { ...ANSWER, salaryMax: 55000.5 }],
    ["whose requirements are not a list", { ...ANSWER, requirements: "TypeScript, React" }],
    ["that says maybe where yes or no is asked", { ...ANSWER, isJobPosting: "maybe" }],
    ["that is still a string of JSON", JSON.stringify(ANSWER)],
    ["that is a list", [ANSWER]],
    ["that is nothing at all", null],
  ])("throws away an answer %s", (_name, answer) => {
    expect(extractionSchema.safeParse(answer).success).toBe(false);
  });

  it("drops whatever a model adds that nobody asked for", () => {
    const parsed = extractionSchema.parse({ ...ANSWER, status: "OFFER", userId: "someone-else" });

    expect(parsed).toEqual(ANSWER);
  });
});

describe("the wording", () => {
  it("has a rule written next to every field", () => {
    for (const [name, field] of Object.entries(extractionSchema.shape)) {
      expect(field.description, name).toBeTruthy();
    }
  });

  it("spells the rule of every field out in the instructions, for a model that never sees the schema", () => {
    for (const [name, field] of Object.entries(extractionSchema.shape)) {
      expect(INSTRUCTIONS).toContain(`- ${name}: ${field.description}`);
    }
  });

  it("changes its version whenever the instructions or the rule of a field change", () => {
    const fingerprint = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 12);

    // When this fails, the model is told something it was not told before.
    // Raise EXTRACTION_VERSION, then put the new version and fingerprint here.
    expect({ version: EXTRACTION_VERSION, fingerprint }).toEqual({
      version: 1,
      fingerprint: "989959d49723",
    });
  });

  it("puts the posting between tags, so its text cannot pass for instructions", () => {
    expect(postingMessage("We are hiring.")).toBe("<posting>\nWe are hiring.\n</posting>");
  });
});
