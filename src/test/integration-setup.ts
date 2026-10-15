import { execFileSync } from "node:child_process";
import { Client } from "pg";

/**
 * Runs once before the integration tests. Refuses anything that does not look
 * like a test database, creates it on first use and brings its schema up to
 * date with the same migrations a deployment runs.
 */
export default async function setup() {
  // Set in vitest.config.mts, with a default that matches docker-compose.yml.
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not set.");
  }

  const url = new URL(testDatabaseUrl);
  const name = url.pathname.slice(1);

  // Every test truncates all tables. Pointed at the development database by
  // mistake, the suite would wipe it, so the name has to say that it is a test.
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to run integration tests against "${name}". The database name has to end in _test.`,
    );
  }

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const client = new Client({ connectionString: maintenance.toString() });

  await client.connect();

  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);

    if (existing.rowCount === 0) {
      // A database name cannot be a query parameter. The pattern checked above
      // is what keeps this line safe.
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
