import { z } from "zod";
import { Source, Status } from "@/generated/prisma/enums";

/**
 * Everything arriving from a form is a string, including numbers, dates and
 * empty fields. These helpers do the conversion once, so the rest of the code
 * works with real types instead of parsing strings all over the place.
 */

/** "" becomes undefined, anything else stays. Empty inputs are not values. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/** "45000" becomes 45000, "" becomes undefined, "abc" becomes an error. */
const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : Number(value)))
  .refine((value) => value === undefined || (Number.isFinite(value) && value >= 0), {
    message: "Enter a whole number, or leave it empty.",
  })
  .optional();

/** "2026-09-17" becomes a Date, "" becomes undefined. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : new Date(value)))
  .refine((value) => value === undefined || !Number.isNaN(value.getTime()), {
    message: "That is not a valid date.",
  })
  .optional();

/**
 * For arguments that reach an action through `bind` or a direct call. They are
 * client input just like form fields, only less obviously so. See the note in
 * lib/applications/actions.ts.
 */
export const applicationIdSchema = z.string().min(1);
export const statusSchema = z.enum(Status);

export const applicationSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(1, "Which company is this for?")
      .max(200, "That name is unusually long."),
    role: z.string().trim().min(1, "What role did you apply for?").max(200),
    status: statusSchema,
    source: z.enum(Source),
    salaryMin: optionalMoney,
    salaryMax: optionalMoney,
    postingUrl: optionalText.refine(
      (value) => value === undefined || URL.canParse(value),
      "That does not look like a link.",
    ),
    notes: optionalText,
    appliedAt: optionalDate,
    followUpAt: optionalDate,
  })
  .refine(
    (data) =>
      data.salaryMin === undefined ||
      data.salaryMax === undefined ||
      data.salaryMin <= data.salaryMax,
    { message: "The lower figure cannot be above the upper one.", path: ["salaryMax"] },
  );

export type ApplicationInput = z.infer<typeof applicationSchema>;

/**
 * Pulls the fields out of a FormData in one place, used by create and update.
 *
 * A browser always sends every field, empty ones as "". Someone posting to the
 * action directly can leave fields out entirely, and formData.get() answers
 * null for those. The `?? ""` turns that back into the empty-field case instead
 * of a type error deep inside the schema.
 */
export function applicationFormData(formData: FormData) {
  const field = (name: string) => (formData.get(name) ?? "").toString();

  return {
    companyName: field("companyName"),
    role: field("role"),
    status: field("status"),
    source: field("source"),
    salaryMin: field("salaryMin"),
    salaryMax: field("salaryMax"),
    postingUrl: field("postingUrl"),
    notes: field("notes"),
    appliedAt: field("appliedAt"),
    followUpAt: field("followUpAt"),
  };
}
