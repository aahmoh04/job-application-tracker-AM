import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeRedis, getRedis } from "@/lib/redis";
import { resetRedis } from "@/test/redis";
import { cached, invalidateCache } from "./cache";

const USER = "user-1";
const NAME = "test";
const TTL = 60_000;

/** A computation that counts its runs, so a test can tell a hit from a miss. */
function counter() {
  let runs = 0;
  return async () => ({ runs: ++runs });
}

beforeEach(async () => {
  await resetRedis();
});

afterAll(async () => {
  await closeRedis();
});

describe("the cache", () => {
  it("computes once and answers from Redis after that", async () => {
    const compute = counter();

    expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 1 });
    expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 1 });
  });

  it("computes again once the user's cache was invalidated", async () => {
    const compute = counter();
    await cached(USER, NAME, TTL, compute);

    await invalidateCache(USER);

    expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 2 });
    expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 2 });
  });

  it("keeps users apart, in what it serves and in what it invalidates", async () => {
    await cached("someone", NAME, TTL, async () => ({ owner: "someone" }));

    expect(
      await cached("someone else", NAME, TTL, async () => ({ owner: "someone else" })),
    ).toEqual({ owner: "someone else" });

    await invalidateCache("someone");

    expect(await cached("someone", NAME, TTL, async () => ({ owner: "someone, fresh" }))).toEqual({
      owner: "someone, fresh",
    });
    expect(
      await cached("someone else", NAME, TTL, async () => ({ owner: "someone else, fresh" })),
    ).toEqual({ owner: "someone else" });
  });

  it("keeps entries with different names apart", async () => {
    await cached(USER, "one", TTL, async () => ({ name: "one" }));

    expect(await cached(USER, "two", TTL, async () => ({ name: "two" }))).toEqual({ name: "two" });
  });

  it("stores every entry with an expiry, so none outlives its TTL", async () => {
    await cached(USER, NAME, TTL, counter());

    const redis = (await getRedis())!;
    const keys = await redis.keys("*");

    expect(keys).toHaveLength(1);

    const ttl = await redis.pTTL(keys[0]);

    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it("passes a failed computation on, runs it only once and stores nothing", async () => {
    let runs = 0;
    const failing = async () => {
      runs += 1;
      throw new Error("Postgres is down");
    };

    await expect(cached(USER, NAME, TTL, failing)).rejects.toThrow("Postgres is down");
    expect(runs).toBe(1);
    expect(await cached(USER, NAME, TTL, counter())).toEqual({ runs: 1 });
  });

  it("never serves a result that was computed while the data changed", async () => {
    // A slow page view. It has looked at the cache, found nothing, and is
    // still computing from data that a write is about to change.
    let computing!: () => void;
    const started = new Promise<void>((resolve) => {
      computing = resolve;
    });
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const slow = cached(USER, NAME, TTL, async () => {
      computing();
      await finished;
      return { applications: 1 };
    });

    await started;

    // The write commits and invalidates. Only then does the slow view store
    // what it computed from the old data.
    await invalidateCache(USER);
    finish();

    expect(await slow).toEqual({ applications: 1 });

    // The next view has to compute again instead of getting the old result.
    expect(await cached(USER, NAME, TTL, async () => ({ applications: 2 }))).toEqual({
      applications: 2,
    });
  });
});

describe("without Redis", () => {
  it("computes every time when no Redis is configured", async () => {
    vi.stubEnv("REDIS_URL", "");

    try {
      const compute = counter();

      expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 1 });
      expect(await cached(USER, NAME, TTL, compute)).toEqual({ runs: 2 });
      await expect(invalidateCache(USER)).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("computes, quickly, when Redis does not answer, and a write still goes through", async () => {
    await closeRedis();
    // Nothing listens on this port.
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6390/15");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();

    try {
      expect(await cached(USER, NAME, TTL, counter())).toEqual({ runs: 1 });
      expect(Date.now() - started).toBeLessThan(2_000);
      await expect(invalidateCache(USER)).resolves.toBeUndefined();
    } finally {
      errors.mockRestore();
      vi.unstubAllEnvs();
      await closeRedis();
    }
  });
});
