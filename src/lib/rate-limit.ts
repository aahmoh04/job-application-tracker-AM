import { createHash, randomUUID } from "node:crypto";
import { getRedis } from "@/lib/redis";

/**
 * Sliding-window rate limits, kept in Redis.
 *
 * Every subject, an address or an account, gets a sorted set of the moments
 * it was counted, scored by time. A check first drops everything older than
 * the window and then counts what is left, so the window really slides
 * instead of resetting on the hour, which would allow twice the limit across
 * the boundary. Each step runs as one Lua script, and Redis runs a script
 * without interleaving anything else, so two requests at the same moment
 * cannot both slip in as the last allowed one.
 *
 * If Redis is not configured or does not answer, the request goes through.
 * Locking everyone out whenever Redis has a bad minute would be an outage of
 * its own, and the cost of Argon2id still keeps guessing slow.
 */

const MINUTE = 60_000;

export type Limit = {
  /** Part of the Redis key, keeps the limits apart. */
  name: string;
  max: number;
  windowMs: number;
};

/** Wrong passwords for one account, whether or not the account exists. */
export const SIGN_IN_FAILURES_PER_ACCOUNT: Limit = {
  name: "sign-in:account",
  max: 5,
  windowMs: 15 * MINUTE,
};

/** Every sign-in attempt from one address, across all accounts. */
export const SIGN_IN_ATTEMPTS_PER_ADDRESS: Limit = {
  name: "sign-in:address",
  max: 20,
  windowMs: 15 * MINUTE,
};

/** New accounts from one address, a taken address included. */
export const SIGN_UPS_PER_ADDRESS: Limit = {
  name: "sign-up:address",
  max: 5,
  windowMs: 60 * MINUTE,
};

export type Verdict = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * KEYS[1] is the set. ARGV holds now, the window and the maximum in
 * milliseconds and counts, whether to record the attempt, and a unique
 * member for it. Returns {1, 0} when allowed, otherwise {0, ms until the
 * oldest counted attempt leaves the window}.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])

redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)

local count = redis.call("ZCARD", key)
if count >= max then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  return {0, tonumber(oldest[2]) + window - now}
end

if ARGV[4] == "1" then
  redis.call("ZADD", key, now, ARGV[5])
  redis.call("PEXPIRE", key, window)
end

return {1, 0}
`;

/** Hashed, so Redis never holds an email address or an IP address in plain text. */
export function keyFor(limit: Limit, subject: string): string {
  const digest = createHash("sha256").update(subject).digest("hex");
  return `rate-limit:${limit.name}:${digest}`;
}

async function evaluate(
  limit: Limit,
  subject: string,
  record: boolean,
  now: number,
): Promise<Verdict> {
  try {
    const redis = await getRedis();

    if (!redis) {
      return { allowed: true };
    }

    const reply = (await redis.eval(SLIDING_WINDOW, {
      keys: [keyFor(limit, subject)],
      arguments: [
        String(now),
        String(limit.windowMs),
        String(limit.max),
        record ? "1" : "0",
        `${now}:${randomUUID()}`,
      ],
    })) as [number, number];

    return reply[0] === 1 ? { allowed: true } : { allowed: false, retryAfterMs: reply[1] };
  } catch (error) {
    console.error("Rate limit unavailable, letting the request through.", error);
    return { allowed: true };
  }
}

/** Counts one attempt, unless the limit is already reached. */
export function hit(limit: Limit, subject: string, now = Date.now()): Promise<Verdict> {
  return evaluate(limit, subject, true, now);
}

/** Looks without counting, for limits that only count failures. */
export function peek(limit: Limit, subject: string, now = Date.now()): Promise<Verdict> {
  return evaluate(limit, subject, false, now);
}

/** Forgets every counted attempt, for example after a successful sign-in. */
export async function clear(limit: Limit, subject: string): Promise<void> {
  try {
    const redis = await getRedis();
    await redis?.del(keyFor(limit, subject));
  } catch (error) {
    console.error("Rate limit unavailable, could not clear it.", error);
  }
}

/** "Try again in 3 minutes", rounded up, never zero. */
export function retryMessage(verdict: { retryAfterMs: number }): string {
  const minutes = Math.max(1, Math.ceil(verdict.retryAfterMs / MINUTE));
  return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
