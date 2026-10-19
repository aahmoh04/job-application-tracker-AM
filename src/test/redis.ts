import { getRedis } from "@/lib/redis";

/** The Redis database the tests own. Development uses 0, the default. */
const TEST_DATABASE = "/15";

/**
 * Empties the test database. FLUSHDB wipes every key, so it refuses to run
 * against anything but database 15, the same idea as the _test rule for
 * Postgres in integration-setup.ts.
 */
export async function resetRedis() {
  const url = new URL(process.env.REDIS_URL ?? "redis://unset");

  if (url.pathname !== TEST_DATABASE) {
    throw new Error(
      `Refusing to flush Redis database "${url.pathname}". The tests only use ${TEST_DATABASE}.`,
    );
  }

  const redis = await getRedis();
  await redis?.flushDb();
}
