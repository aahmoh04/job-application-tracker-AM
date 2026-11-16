"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/guard";
import {
  hitStrict,
  POSTING_READS_PER_ACCOUNT,
  POSTING_READS_PER_INSTALLATION,
  retryMessage,
} from "@/lib/rate-limit";
import { postingFormData, postingTextSchema } from "@/lib/validation/posting";
import { EXTRACTION_VERSION, extractionSchema } from "./extraction";
import { postingReaderAvailable, readPosting } from "./reader";
import { suggestionFrom, type SuggestedFields } from "./suggestion";

/** Either a suggestion or the reason there is none, never both. */
export type PostingResult = {
  /** Why nothing was filled in, shown under the box. */
  message?: string;
  suggestion?: {
    /** New with every read, so the form can tell a second suggestion from the first. */
    id: string;
    fields: SuggestedFields;
    filled: string[];
  };
};

/** The subject of the limit that all accounts share. */
const EVERYONE = "everyone";

const NOT_RIGHT_NOW: PostingResult = {
  message: "Postings cannot be read right now. The form below works as always.",
};

/**
 * Reads a pasted job posting and suggests values for the form. It saves
 * nothing. The suggestion goes back to the browser, into the form, and only
 * what the user then submits reaches the database, through the same action
 * and the same validation as a form filled in by hand.
 *
 * The answer of a model is input like any other. It is parsed against a
 * schema before anything looks at it, and an answer that fails is thrown
 * away, which leaves the user with the empty form they would have had anyway.
 */
export async function suggestFromPosting(formData: unknown): Promise<PostingResult> {
  const user = await requireUser();

  // Called from the browser with the form's data, but an action is its own
  // endpoint and can be called with anything.
  const text = postingTextSchema.safeParse(
    formData instanceof FormData ? postingFormData(formData) : "",
  );

  if (!text.success) {
    return { message: text.error.issues[0].message };
  }

  if (!postingReaderAvailable()) {
    return { message: "Reading postings is not set up here." };
  }

  // Counted before the model is called, because the call is what costs, and
  // it costs the same when the answer turns out to be useless. The account
  // comes first, so an account that is over its limit does not use up what
  // everyone shares.
  const account = await hitStrict(POSTING_READS_PER_ACCOUNT, user.id);

  if (!account) {
    return NOT_RIGHT_NOW;
  }

  if (!account.allowed) {
    return {
      message: `You can have ${POSTING_READS_PER_ACCOUNT.max} postings read per hour. ${retryMessage(account)}`,
    };
  }

  const installation = await hitStrict(POSTING_READS_PER_INSTALLATION, EVERYONE);

  if (!installation) {
    return NOT_RIGHT_NOW;
  }

  if (!installation.allowed) {
    return { message: "The limit for reading postings is reached for now. Try again later." };
  }

  let answer: unknown;

  try {
    answer = await readPosting(text.data);
  } catch (error) {
    console.error("Reading the posting failed.", error);
    return { message: "The posting could not be read. Try again in a moment." };
  }

  const extraction = extractionSchema.safeParse(answer);

  if (!extraction.success) {
    // Paths and codes only. The values could be the text the user pasted.
    console.error(
      `Answer to a posting thrown away, extraction v${EXTRACTION_VERSION}.`,
      extraction.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`),
    );
    return { message: "The answer to that posting made no sense, so nothing was filled in." };
  }

  if (!extraction.data.isJobPosting) {
    return { message: "That does not read like a job posting, so nothing was filled in." };
  }

  const suggestion = suggestionFrom(extraction.data);

  if (!suggestion) {
    return {
      message: "Neither a company nor a role could be found in that text.",
    };
  }

  return { suggestion: { id: randomUUID(), ...suggestion } };
}
