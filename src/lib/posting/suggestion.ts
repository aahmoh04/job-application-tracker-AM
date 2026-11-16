import { dateFormat } from "@/lib/format";
import { MAX_INT } from "@/lib/validation/application";
import type { Extraction } from "./extraction";

/**
 * Turns what the model returned into values for the application form.
 *
 * By the time an answer gets here, the schema has made sure of its shape,
 * every field is there and has the right type. That says nothing about the
 * content. A model can return a date that does not exist, or a lower salary
 * above the upper one. So every field is checked on its own, and one that
 * fails is left empty while the rest is kept. An empty field is obvious in
 * the form, a wrong one is not.
 *
 * Whatever comes out of here passes the form's own validation, so a
 * suggestion is never the reason a save gets refused. A test holds the two
 * together.
 */

/** The fields of the form a posting can fill. Strings, the way inputs hold them. */
export type SuggestedFields = {
  companyName: string;
  role: string;
  salaryMin: string;
  salaryMax: string;
  notes: string;
};

export type Suggestion = {
  fields: SuggestedFields;
  /** What got a value, in the words of the form, for the line above it. */
  filled: string[];
};

/** The form refuses a longer company or role, see applicationSchema. */
const MAX_NAME_LENGTH = 200;
const MAX_REQUIREMENTS = 8;
const MAX_REQUIREMENT_LENGTH = 200;

/** One line, without the whitespace a model or a copied page leaves in it. */
function oneLine(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Short enough for the form, or nothing at all. Text cut to fit would look
 * complete and not be.
 */
function shortLine(value: string | null, maxLength: number): string {
  const line = oneLine(value);

  return line.length <= maxLength ? line : "";
}

/** A figure both salary columns can hold, or null. */
function amount(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 && value <= MAX_INT ? value : null;
}

/** "2026-11-30" as a date, null for anything else. */
function calendarDate(value: string | null): Date | null {
  // A whole day or nothing. new Date() would take "2026-11" as well and make
  // it the first of the month, a day the posting never named.
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  // new Date() can roll 30 February over into March instead of refusing it.
  // Only a date that comes back out the way it went in exists.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? date : null;
}

/** Location, deadline and requirements as the text of the notes field. */
function notesFrom(extraction: Extraction): string {
  const location = shortLine(extraction.location, MAX_NAME_LENGTH);
  const applyBy = calendarDate(extraction.applyBy);
  const requirements = extraction.requirements
    .map((requirement) => shortLine(requirement, MAX_REQUIREMENT_LENGTH))
    .filter((requirement) => requirement !== "")
    .slice(0, MAX_REQUIREMENTS);

  const lines: string[] = [];

  if (location) {
    lines.push(`Location: ${location}`);
  }

  if (applyBy) {
    lines.push(`Apply by: ${dateFormat.format(applyBy)}`);
  }

  if (requirements.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }

    lines.push("Requirements:", ...requirements.map((requirement) => `- ${requirement}`));
  }

  return lines.join("\n");
}

/**
 * The suggestion for the form, or null when the answer holds neither a
 * company nor a role. Those two are what the form needs, and notes alone are
 * not worth replacing an empty form for.
 */
export function suggestionFrom(extraction: Extraction): Suggestion | null {
  const companyName = shortLine(extraction.company, MAX_NAME_LENGTH);
  const role = shortLine(extraction.role, MAX_NAME_LENGTH);

  if (!companyName && !role) {
    return null;
  }

  let salaryMin = amount(extraction.salaryMin);
  let salaryMax = amount(extraction.salaryMax);

  // The form refuses a range that runs backwards. Which of the two figures is
  // the wrong one cannot be told from here, so neither is kept.
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    salaryMin = null;
    salaryMax = null;
  }

  const notes = notesFrom(extraction);

  const filled = [
    companyName ? "company" : null,
    role ? "role" : null,
    salaryMin !== null || salaryMax !== null ? "salary" : null,
    notes ? "notes" : null,
  ].filter((label) => label !== null);

  return {
    fields: {
      companyName,
      role,
      salaryMin: salaryMin === null ? "" : String(salaryMin),
      salaryMax: salaryMax === null ? "" : String(salaryMax),
      notes,
    },
    filled,
  };
}
