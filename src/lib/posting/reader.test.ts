import { afterEach, describe, expect, it, vi } from "vitest";
import { postingReader, postingReaderAvailable, readPosting } from "./reader";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("postingReader", () => {
  it("is nobody until a model is set up", () => {
    expect(postingReader()).toBeNull();
  });

  it("is Ollama once its address and a model are both set", () => {
    vi.stubEnv("OLLAMA_URL", "http://127.0.0.1:11434");
    expect(postingReader()).toBeNull();

    vi.stubEnv("OLLAMA_MODEL", "some-model");
    expect(postingReader()).toBe("ollama");
  });
});

describe("postingReaderAvailable", () => {
  it("needs a model and Redis, because a reader without limits stays off", () => {
    expect(postingReaderAvailable()).toBe(false);

    vi.stubEnv("OLLAMA_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "some-model");
    expect(postingReaderAvailable()).toBe(false);

    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    expect(postingReaderAvailable()).toBe(true);
  });

  it("is not satisfied by Redis alone", () => {
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");

    expect(postingReaderAvailable()).toBe(false);
  });
});

describe("readPosting", () => {
  it("calls no one when no model is set up", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(readPosting("We are hiring.")).rejects.toThrow("No model is set up");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes to Ollama when that is the model set up", async () => {
    vi.stubEnv("OLLAMA_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "some-model");
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      requested.push(url.toString());
      return Response.json({ message: { content: '{"isJobPosting":false}' } });
    });

    expect(await readPosting("We are hiring.")).toEqual({ isJobPosting: false });
    expect(requested).toEqual(["http://127.0.0.1:11434/api/chat"]);
  });
});
