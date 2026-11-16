import { z } from "zod";

/**
 * The text of a job posting, pasted in to be read by a model. It is checked
 * before anything is counted or sent, because a model call is the one thing
 * here that costs money per request.
 */

/** Shorter than this is a sentence, not a posting, and not worth a model call. */
export const POSTING_MIN_LENGTH = 100;

/**
 * Room for a long posting with the clutter of the page around it. The ceiling
 * is also what bounds the cost of a single read. Longer text is refused and
 * not cut, because a posting cut in the middle would be read as if it were
 * whole.
 */
export const POSTING_MAX_LENGTH = 20_000;

export const postingTextSchema = z
  .string()
  .trim()
  .min(POSTING_MIN_LENGTH, "That is too short to be a job posting. Paste the whole text.")
  .max(POSTING_MAX_LENGTH, "That is more than 20,000 characters. Paste only the posting itself.");

/** The pasted text from the form, "" when the field is missing or not text. */
export function postingFormData(formData: FormData): string {
  const value = formData.get("posting");

  return typeof value === "string" ? value : "";
}
