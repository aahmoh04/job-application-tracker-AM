import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SESSION_ENDED_PATH } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { redirectTarget } from "@/test/next";

// The session comes from here, the account lookup goes to the real database.
const request = vi.hoisted(() => ({ session: null as SessionPayload | null }));

vi.mock("@/lib/auth/cookies", () => ({
  getSession: async () => request.session,
}));

// Every page under (app), and the layout around them, found by file name. A
// page added later is checked without anyone remembering to list it here.
const here = fileURLToPath(new URL(".", import.meta.url));
const files = readdirSync(here, { encoding: "utf8", recursive: true })
  .filter((file) => file.endsWith("page.tsx") || file === "layout.tsx")
  .sort();

// What Next hands a page or a layout. The guard has to answer before any of it
// is read.
const props = {
  params: Promise.resolve({ id: "some-id" }),
  searchParams: Promise.resolve({}),
  children: null,
};

async function render(file: string): Promise<unknown> {
  const { default: Component } = await import(join(here, file));
  return Component(props);
}

afterAll(async () => {
  await prisma.$disconnect();
});

it("finds the pages to check", () => {
  // Over an empty list the checks below would pass without checking anything.
  expect(files).toContain("layout.tsx");
  expect(files).toContain(join("dashboard", "page.tsx"));
  expect(files.length).toBeGreaterThanOrEqual(8);
});

describe.each(files)("%s", (file) => {
  it("sends a signed-out visitor to sign in", async () => {
    request.session = null;

    expect(await redirectTarget(render(file))).toBe("/sign-in");
  });

  it("sends a session whose account is gone to have its cookie cleared", async () => {
    // A token that is still valid, for an account that no longer exists.
    request.session = { userId: "an-account-that-was-deleted" };

    expect(await redirectTarget(render(file))).toBe(SESSION_ENDED_PATH);
  });
});
