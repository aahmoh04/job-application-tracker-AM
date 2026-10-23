import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import { endsInNotFound } from "@/test/next";
import ApplicationDetailPage from "../applications/[id]/page";
import AdminPage from "./page";

// The session comes from here, its account and role from the real database.
// Signed out and dead sessions are covered for every page in pages.int.test.ts.
const request = vi.hoisted(() => ({ session: null as SessionPayload | null }));

vi.mock("@/lib/auth/cookies", () => ({
  getSession: async () => request.session,
}));

let me: string;

beforeEach(async () => {
  await resetDatabase();
  me = (await createUser("me@example.com")).id;
  request.session = { userId: me };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeMe(role: "USER" | "ADMIN") {
  await prisma.user.update({ where: { id: me }, data: { role } });
}

describe("the admin page", () => {
  it("is a 404 for a signed-in user without the role", async () => {
    expect(await endsInNotFound(AdminPage())).toBe(true);
  });

  it("opens for an admin", async () => {
    await makeMe("ADMIN");

    expect(await endsInNotFound(AdminPage())).toBe(false);
  });

  it("closes with the next request once the role is gone", async () => {
    await makeMe("ADMIN");
    expect(await endsInNotFound(AdminPage())).toBe(false);

    await makeMe("USER");
    expect(await endsInNotFound(AdminPage())).toBe(true);
  });
});

describe("an admin", () => {
  it("still gets a 404 for someone else's application", async () => {
    await makeMe("ADMIN");
    const stranger = (await createUser("stranger@example.com")).id;
    const theirs = await createApplication(stranger, {
      status: "APPLIED",
      events: [{ to: "APPLIED", at: new Date() }],
    });

    const page = ApplicationDetailPage({
      params: Promise.resolve({ id: theirs.id }),
      searchParams: Promise.resolve({}),
    });

    expect(await endsInNotFound(page)).toBe(true);
  });
});
