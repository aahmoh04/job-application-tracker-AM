import { z } from "zod";
import { extractionSchema, INSTRUCTIONS, postingMessage } from "./extraction";

/**
 * Reads a posting with a model that runs on this machine, through Ollama.
 * The text never leaves the computer and a read costs nothing but time. One
 * documented POST, so fetch does the job, like the mail transports.
 *
 * https://docs.ollama.com/api
 */

// A local model is loaded into memory by its first request, and a small
// machine takes its time with a long posting.
const TIMEOUT_MS = 90_000;

/**
 * The answer's schema as JSON Schema. Ollama turns it into a grammar the model
 * cannot step outside of, so the answer always parses. The bounds Zod writes
 * for a whole number are left out, they would become part of that grammar
 * without saying anything about a salary.
 */
function answerFormat() {
  return z.toJSONSchema(extractionSchema, {
    override: ({ jsonSchema }) => {
      delete jsonSchema.minimum;
      delete jsonSchema.maximum;
    },
  });
}

export async function readWithOllama(
  baseUrl: string,
  model: string,
  posting: string,
): Promise<unknown> {
  const response = await fetch(new URL("/api/chat", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: postingMessage(posting) },
      ],
      format: answerFormat(),
      stream: false,
      // The same posting should come back as the same fields.
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Only the status goes into the error. The body could echo the posting back.
  if (!response.ok) {
    throw new Error(`Ollama answered with status ${response.status}.`);
  }

  const body = (await response.json()) as { message?: { content?: unknown } } | null;
  const content = body?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Ollama answered without a message.");
  }

  try {
    return JSON.parse(content);
  } catch {
    // The error JSON.parse throws quotes the start of what it was given, and a
    // model's answer can start with the posting. This one ends up in the log.
    throw new Error("Ollama answered with something that is not JSON.");
  }
}
