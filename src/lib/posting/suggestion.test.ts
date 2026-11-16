import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/lib/validation/application";
import type { Extraction } from "./extraction";
import { suggestionFrom } from "./suggestion";

const FOUND: Extraction = {
  isJobPosting: true,
  company: "Northwind Systems GmbH",
  role: "Junior Developer",
  location: "Stuttgart, hybrid",
  salaryMin: 48000,
  salaryMax: 55000,
  applyBy: "2026-11-30",
  requirements: ["TypeScript", "React"],
};

/** The notes of a suggestion, for the tests that only look at those. */
function notes(overrides: Partial<Extraction>): string {
  return suggestionFrom({ ...FOUND, ...overrides })!.fields.notes;
}

describe("suggestionFrom", () => {
  it("fills company, role, salary and notes from an answer that found everything", () => {
    expect(suggestionFrom(FOUND)).toEqual({
      fields: {
        companyName: "Northwind Systems GmbH",
        role: "Junior Developer",
        salaryMin: "48000",
        salaryMax: "55000",
        notes: [
          "Location: Stuttgart, hybrid",
          "Apply by: 30 Nov 2026",
          "",
          "Requirements:",
          "- TypeScript",
          "- React",
        ].join("\n"),
      },
      filled: ["company", "role", "salary", "notes"],
    });
  });

  it("suggests nothing without a company or a role, however much else was found", () => {
    expect(suggestionFrom({ ...FOUND, company: null, role: null })).toBeNull();
    expect(suggestionFrom({ ...FOUND, company: "   ", role: "\n" })).toBeNull();
  });

  it("leaves empty what the posting did not state and says what it filled", () => {
    const suggestion = suggestionFrom({
      ...FOUND,
      company: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      applyBy: null,
      requirements: [],
    });

    expect(suggestion).toEqual({
      fields: {
        companyName: "",
        role: "Junior Developer",
        salaryMin: "",
        salaryMax: "",
        notes: "",
      },
      filled: ["role"],
    });
  });

  it("straightens out the whitespace a copied page leaves in a name", () => {
    const suggestion = suggestionFrom({ ...FOUND, company: "  Northwind\n   Systems\tGmbH " });

    expect(suggestion!.fields.companyName).toBe("Northwind Systems GmbH");
  });

  it("leaves a name out that the form would refuse as too long, instead of cutting it", () => {
    const suggestion = suggestionFrom({ ...FOUND, company: "N".repeat(201) });

    expect(suggestion!.fields.companyName).toBe("");
    expect(suggestion!.fields.role).toBe("Junior Developer");
    expect(suggestionFrom({ ...FOUND, company: "N".repeat(200) })!.fields.companyName).toHaveLength(
      200,
    );
  });

  it.each([
    ["both ends of a range", 48000, 55000, "48000", "55000"],
    ["a single figure given twice", 50000, 50000, "50000", "50000"],
    ["only the lower end", 48000, null, "48000", ""],
    ["only the upper end", null, 55000, "", "55000"],
    ["the largest figure the column holds", null, 2147483647, "", "2147483647"],
  ])("keeps %s", (_name, salaryMin, salaryMax, expectedMin, expectedMax) => {
    const { fields } = suggestionFrom({ ...FOUND, salaryMin, salaryMax })!;

    expect([fields.salaryMin, fields.salaryMax]).toEqual([expectedMin, expectedMax]);
  });

  it.each([
    ["a range that runs backwards, both ends of it", 55000, 48000, "", ""],
    ["zero, which is no salary", 0, 55000, "", "55000"],
    ["a negative figure", -48000, null, "", ""],
    ["half a euro", 48000.5, null, "", ""],
    ["a figure the column cannot hold", 48000, 2147483648, "48000", ""],
  ])("leaves out %s", (_name, salaryMin, salaryMax, expectedMin, expectedMax) => {
    const { fields } = suggestionFrom({ ...FOUND, salaryMin, salaryMax })!;

    expect([fields.salaryMin, fields.salaryMax]).toEqual([expectedMin, expectedMax]);
  });

  it("does not count the salary as filled when both ends were left out", () => {
    expect(suggestionFrom({ ...FOUND, salaryMin: 55000, salaryMax: 48000 })!.filled).toEqual([
      "company",
      "role",
      "notes",
    ]);
  });

  it.each(["2026-02-30", "2026-13-01", "30.11.2026", "2026-11-30T12:00:00Z", "soon", ""])(
    "leaves out a deadline that is not a real date, like %j",
    (applyBy) => {
      expect(notes({ applyBy })).not.toContain("Apply by");
    },
  );

  it.each(["2026-11", "2026"])(
    "does not make up a day for a deadline that only names %j",
    (applyBy) => {
      expect(notes({ applyBy })).not.toContain("Apply by");
    },
  );

  it("keeps a deadline on a leap day", () => {
    expect(notes({ applyBy: "2028-02-29" })).toContain("Apply by: 29 Feb 2028");
  });

  it("keeps eight requirements at most and none that are empty or run on", () => {
    const requirements = [
      "  ",
      ...Array.from({ length: 10 }, (_, index) => `Skill ${index + 1}`),
      "R".repeat(201),
    ];

    expect(notes({ location: null, applyBy: null, requirements })).toBe(
      [
        "Requirements:",
        "- Skill 1",
        "- Skill 2",
        "- Skill 3",
        "- Skill 4",
        "- Skill 5",
        "- Skill 6",
        "- Skill 7",
        "- Skill 8",
      ].join("\n"),
    );
  });

  it("never suggests a value the form itself would refuse", () => {
    const awkward: Partial<Extraction>[] = [
      {},
      { company: "N".repeat(500), role: "R".repeat(200) },
      { role: null, salaryMin: 2147483647, salaryMax: 2147483647 },
      { salaryMin: 55000, salaryMax: 48000 },
      { salaryMin: -1, salaryMax: 2147483648 },
      { salaryMin: 48000.5, salaryMax: 0 },
      { applyBy: "2026-02-30", location: "L".repeat(500) },
      { requirements: Array.from({ length: 50 }, () => "R".repeat(200)) },
    ];

    for (const overrides of awkward) {
      const suggestion = suggestionFrom({ ...FOUND, ...overrides });

      // A field the suggestion left empty is the user's to fill in. What
      // matters is that nothing that was filled in makes the save fail.
      const submitted = applicationSchema.safeParse({
        status: "DRAFT",
        source: "DIRECT",
        postingUrl: "",
        appliedAt: "",
        followUpAt: "",
        ...suggestion!.fields,
        companyName: suggestion!.fields.companyName || "Typed by hand",
        role: suggestion!.fields.role || "Typed by hand",
      });

      expect(submitted.success, JSON.stringify(overrides).slice(0, 80)).toBe(true);
    }
  });
});
