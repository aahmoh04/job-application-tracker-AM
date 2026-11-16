import { readWithOllama } from "./ollama";

/**
 * Hands a job posting to a model and returns whatever came back, as parsed
 * JSON and nothing more. Whether that answer can be trusted is not decided
 * here. The caller holds it against the schema, the same way for every model.
 *
 * Which model reads depends on the environment, the same idea as the mail
 * transports in src/lib/mail/send.ts. Without one the feature is switched
 * off, and the form works by hand as it always did.
 */

export type ReaderName = "ollama";

/** The model that reads postings here, or null when none is set up. */
export function postingReader(): ReaderName | null {
  if (process.env.OLLAMA_URL && process.env.OLLAMA_MODEL) {
    return "ollama";
  }

  return null;
}

/**
 * True when a model is set up and its limits can be counted. Those live in
 * Redis, and a reader without limits is a bill without a ceiling, so without
 * Redis the reader stays off.
 */
export function postingReaderAvailable(): boolean {
  return postingReader() !== null && Boolean(process.env.REDIS_URL);
}

export async function readPosting(posting: string): Promise<unknown> {
  const reader = postingReader();

  if (reader === "ollama") {
    return readWithOllama(process.env.OLLAMA_URL!, process.env.OLLAMA_MODEL!, posting);
  }

  throw new Error("No model is set up to read postings. Set OLLAMA_URL and OLLAMA_MODEL.");
}
