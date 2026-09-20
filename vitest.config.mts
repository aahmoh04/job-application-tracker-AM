import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next understands "@/..." because tsconfig says so, but Vitest does not read
  // tsconfig paths. Until now no test needed it, the auth test imports its
  // neighbour relatively. The pipeline test imports the generated Prisma enums,
  // so the alias has to be spelled out once, here.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
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
