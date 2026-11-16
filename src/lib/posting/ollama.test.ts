import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTRUCTIONS } from "./extraction";
import { readWithOllama } from "./ollama";

const ANSWER = { isJobPosting: true, company: "Northwind Systems", role: "Junior Developer" };

/** Stands in for Ollama, records every request and answers with this body. */
function fakeOllama(
  body: unknown = { message: { content: JSON.stringify(ANSWER) } },
  status = 200,
) {
  const calls: { url: string; init: RequestInit }[] = [];

  vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
    calls.push({ url: url.toString(), init });
    return new Response(JSON.stringify(body), { status });
  });

  return calls;
}

function read() {
  return readWithOllama("http://127.0.0.1:11434", "some-model", "We are hiring.");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readWithOllama", () => {
  it("sends the instructions and the posting in one request and returns the parsed answer", async () => {
    const calls = fakeOllama();

    expect(await read()).toEqual(ANSWER);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({
      model: "some-model",
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: "<posting>\nWe are hiring.\n</posting>" },
      ],
      stream: false,
      options: { temperature: 0 },
    });
  });

  it("hands over the schema, so the model cannot answer in any other shape", async () => {
    const calls = fakeOllama();

    await read();
    const { format } = JSON.parse(calls[0].init.body as string);

    expect(format.type).toBe("object");
    expect(format.additionalProperties).toBe(false);
    expect(format.required).toEqual([
      "isJobPosting",
      "company",
      "role",
      "location",
      "salaryMin",
      "salaryMax",
      "applyBy",
      "requirements",
    ]);
    expect(format.properties.role.description).toMatch(/job title/);
    // The bounds of a whole number would only bloat the grammar.
    expect(JSON.stringify(format)).not.toMatch(/minimum|maximum/);
  });

  it("throws with the status and nothing else when Ollama refuses", async () => {
    fakeOllama({ error: "model 'some-model' not found" }, 404);

    await expect(read()).rejects.toThrow("Ollama answered with status 404.");
  });

  it("throws when the answer carries no message", async () => {
    fakeOllama({ done: true });

    await expect(read()).rejects.toThrow("Ollama answered without a message.");
  });

  it("throws when the message is not JSON, without quoting it", async () => {
    fakeOllama({ message: { content: "Sure! Here is the secret posting you sent me." } });

    const error = await read().catch((caught: unknown) => caught);

    // Exactly this text and nothing of the answer, because it goes to the log.
    expect(error).toEqual(new Error("Ollama answered with something that is not JSON."));
    expect(String(error)).not.toContain("Sure");
  });
});
