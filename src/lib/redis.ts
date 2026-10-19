import { createClient } from "@redis/client";

/**
 * One Redis connection per process, opened on first use.
 *
 * Redis backs the rate limits, and nothing it does is worth taking the app
 * down for. Without REDIS_URL the caller simply gets null. A connection that
 * cannot be opened is forgotten, so the next request tries again. Commands are
 * never queued while the connection is down, and none of them waits longer
 * than half a second, because a sign-in must not hang just because Redis does.
 */

const CONNECT_TIMEOUT_MS = 1_000;

function create(url: string) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    commandOptions: { timeout: 500 },
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Once connected, a dropped connection is retried in the background,
      // at most every two seconds.
      reconnectStrategy: (retries) => Math.min(retries * 100, 2_000),
    },
  });

  // Without a listener the client throws on every connection error.
  client.on("error", (error: Error) => {
    console.error(`Redis: ${error.message}`);
  });

  return client;
}

// Taken from create() rather than from createClient, so the type matches the
// options above exactly.
type Redis = ReturnType<typeof create>;

// Next reloads modules on every change in development. Keeping the connection
// on globalThis stops each reload from opening another one, like src/lib/db.ts.
const globalForRedis = globalThis as unknown as { redis?: Promise<Redis> };

export async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;

  if (!url) {
    return null;
  }

  globalForRedis.redis ??= connect(url).catch((error: unknown) => {
    globalForRedis.redis = undefined;
    throw error;
  });

  return globalForRedis.redis;
}

/** Closes the connection, used by the tests so the process can exit. */
export async function closeRedis(): Promise<void> {
  const pending = globalForRedis.redis;
  globalForRedis.redis = undefined;

  const client = await pending?.catch(() => null);
  await client?.close();
}

async function connect(url: string): Promise<Redis> {
  const client = create(url);

  // connect() keeps retrying through the reconnect strategy and would never
  // settle while Redis is down, so the first attempt gets a deadline.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis did not answer within ${CONNECT_TIMEOUT_MS} ms`)),
      CONNECT_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([client.connect(), deadline]);
    return client;
  } catch (error) {
    client.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
