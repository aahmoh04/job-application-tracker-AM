import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeRedis, getRedis } from "@/lib/redis";
import { resetRedis } from "@/test/redis";
import { clear, hit, keyFor, peek, type Limit } from "./rate-limit";

// Three attempts a minute, small enough to walk through by hand.
const LIMIT: Limit = { name: "test", max: 3, windowMs: 60_000 };
// A fixed clock, the script takes "now" from its caller.
const T0 = 1_800_000_000_000;

beforeEach(async () => {
  await resetRedis();
});

afterAll(async () => {
  await closeRedis();
});

describe("the sliding window", () => {
  it("allows up to the maximum and then says when the next attempt is possible", async () => {
    expect(await hit(LIMIT, "someone", T0)).toEqual({ allowed: true });
    expect(await hit(LIMIT, "someone", T0 + 10_000)).toEqual({ allowed: true });
    expect(await hit(LIMIT, "someone", T0 + 20_000)).toEqual({ allowed: true });

    // The oldest attempt leaves the window at T0 plus a minute.
    expect(await hit(LIMIT, "someone", T0 + 30_000)).toEqual({
      allowed: false,
      retryAfterMs: 30_000,
    });
  });

  it("slides, so a slot frees up exactly when the oldest attempt ages out", async () => {
    await hit(LIMIT, "someone", T0);
    await hit(LIMIT, "someone", T0 + 10_000);
    await hit(LIMIT, "someone", T0 + 20_000);

    expect((await hit(LIMIT, "someone", T0 + 59_999)).allowed).toBe(false);
    expect((await hit(LIMIT, "someone", T0 + 60_001)).allowed).toBe(true);

    // The other two are still inside the window, so the very next one waits.
    expect((await hit(LIMIT, "someone", T0 + 60_002)).allowed).toBe(false);
  });

  it("keeps subjects apart", async () => {
    for (const offset of [0, 1, 2]) {
      await hit(LIMIT, "someone", T0 + offset);
    }

    expect((await hit(LIMIT, "someone else", T0 + 3)).allowed).toBe(true);
  });

  it("only looks when asked to peek", async () => {
    for (let offset = 0; offset < 5; offset += 1) {
      expect(await peek(LIMIT, "someone", T0 + offset)).toEqual({ allowed: true });
    }

    expect(await hit(LIMIT, "someone", T0 + 10)).toEqual({ allowed: true });
  });

  it("forgets everything that was counted when cleared", async () => {
    for (const offset of [0, 1, 2]) {
      await hit(LIMIT, "someone", T0 + offset);
    }

    await clear(LIMIT, "someone");

    expect((await hit(LIMIT, "someone", T0 + 3)).allowed).toBe(true);
  });

  it("stores neither the email nor the address in plain text", async () => {
    await hit(LIMIT, "me@example.com", T0);

    const keys = await (await getRedis())!.keys("*");

    expect(keys).toEqual([keyFor(LIMIT, "me@example.com")]);
    expect(keys[0]).not.toContain("me@example.com");
  });

  it("lets the key expire with the window, so nothing piles up", async () => {
    await hit(LIMIT, "someone", T0);

    const ttl = await (await getRedis())!.pTTL(keyFor(LIMIT, "someone"));

    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe("without Redis", () => {
  it("lets every request through when no Redis is configured", async () => {
    vi.stubEnv("REDIS_URL", "");

    try {
      for (let offset = 0; offset < 10; offset += 1) {
        expect(await hit(LIMIT, "someone", T0 + offset)).toEqual({ allowed: true });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lets the request through, quickly, when Redis does not answer", async () => {
    await closeRedis();
    // Nothing listens on this port.
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6390/15");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();

    try {
      expect(await hit(LIMIT, "someone", T0)).toEqual({ allowed: true });
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      errors.mockRestore();
      vi.unstubAllEnvs();
      await closeRedis();
    }
  });
});
