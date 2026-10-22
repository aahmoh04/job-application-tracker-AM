import { getRedis } from "@/lib/redis";

/**
 * A per-user cache in Redis, for results that take work to compute and belong
 * to one user, like the numbers on the analytics page.
 *
 * Every user has a version number, and every entry carries the version it was
 * computed under in its key. A write to the user's data bumps the version,
 * which makes all of that user's older entries unreachable in one step.
 * Nothing gets deleted, old entries simply expire.
 *
 * Bumping rather than deleting is what keeps a slow read from bringing old
 * numbers back. A page view that read the data just before a write, and
 * stores its result just after the write cleared the cache, would put the old
 * numbers right back under the key everyone reads, until they expire. With
 * versions that result lands under the old number, where nobody looks anymore.
 *
 * Like the rate limits, the cache steps aside when Redis is missing or does
 * not answer, and the result comes straight from the database. The expiry
 * covers the rest. If an invalidation gets lost because Redis failed at that
 * moment, no entry outlives its TTL.
 */

/** Anything that comes back from JSON exactly as it went in. A Date would not. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function versionKey(userId: string): string {
  return `cache:${userId}:version`;
}

function entryKey(userId: string, version: string, name: string): string {
  return `cache:${userId}:${version}:${name}`;
}

/**
 * Returns the user's entry under `name` if a current one exists. Otherwise
 * computes it, keeps it for `ttlMs` and returns it.
 */
export async function cached<T extends Json>(
  userId: string,
  name: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  // Only set once the lookup found nothing, so a result is stored only when
  // Redis was there to ask.
  let store: ((value: T) => Promise<unknown>) | undefined;

  try {
    const redis = await getRedis();

    if (redis) {
      // The version is read before anything is computed. If a write lands
      // while the result is being computed, the version has moved on by the
      // time the result is stored, and the result ends up where nobody looks.
      const version = (await redis.get(versionKey(userId))) ?? "0";
      const key = entryKey(userId, version, name);
      const hit = await redis.get(key);

      if (hit !== null) {
        return JSON.parse(hit) as T;
      }

      store = (value) =>
        redis.set(key, JSON.stringify(value), { expiration: { type: "PX", value: ttlMs } });
    }
  } catch (error) {
    console.error("Cache unavailable, computing without it.", error);
  }

  // Outside the try, so a failing computation is passed on as it is and never
  // runs a second time.
  const value = await compute();

  try {
    await store?.(value);
  } catch (error) {
    console.error("Cache unavailable, could not store the result.", error);
  }

  return value;
}

/**
 * Marks everything cached for this user as out of date. Call it once a write
 * has committed, never before. Bumped earlier, a page view running at the same
 * moment could still read the old data and store it under the new version.
 *
 * The version itself never expires. It is one small number per user.
 */
export async function invalidateCache(userId: string): Promise<void> {
  try {
    const redis = await getRedis();
    await redis?.incr(versionKey(userId));
  } catch (error) {
    console.error("Cache unavailable, could not invalidate it.", error);
  }
}
