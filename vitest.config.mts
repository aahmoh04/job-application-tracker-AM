import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The database the integration tests run against. Every test empties it, so
// its name has to end in _test, which src/test/integration-setup.ts checks
// before anything runs. The default matches docker-compose.yml, CI sets its
// own. The global setup runs in this same process and reads it from here.
process.env.TEST_DATABASE_URL ??=
  "postgresql://jobtracker:jobtracker@127.0.0.1:5432/jobtracker_test?schema=public";

// The same for Redis. Database 15 belongs to the tests, development uses 0,
// and src/test/redis.ts refuses to flush any other.
process.env.TEST_REDIS_URL ??= "redis://127.0.0.1:6379/15";

export default defineConfig({
  // Next understands "@/..." because tsconfig says so, but Vitest does not read
  // tsconfig paths. The pipeline test imports the generated Prisma enums, so the
  // alias has to be spelled out once, here.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // No DOM needed, these are plain functions and database queries.
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          env: {
            // A throwaway secret for the suite. The real one lives in .env and
            // is never needed here, the tests only care that signing and
            // verifying agree.
            JWT_SECRET: "test-secret-that-is-long-enough-for-hs256-abcdef",
            // Unit tests never touch a database. With an empty URL,
            // src/lib/db.ts throws on import if one ever tries, and the
            // rate limits stay switched off.
            DATABASE_URL: "",
            REDIS_URL: "",
          },
        },
      },
      {
        extends: true,
        test: {
          // Real queries against a real Postgres, see src/test/. Run with
          // npm run test:integration, Docker has to be up locally.
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./src/test/integration-setup.ts"],
          // All files share one database, so they run one after another.
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            REDIS_URL: process.env.TEST_REDIS_URL,
            // The auth tests sign real session tokens.
            JWT_SECRET: "test-secret-that-is-long-enough-for-hs256-abcdef",
          },
        },
      },
    ],
  },
});
