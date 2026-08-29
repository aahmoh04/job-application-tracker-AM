import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No DOM needed, these are plain functions.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A throwaway secret for the suite. The real one lives in .env and is
    // never needed here, the tests only care that signing and verifying agree.
    env: {
      JWT_SECRET: "test-secret-that-is-long-enough-for-hs256-abcdef",
    },
  },
});
