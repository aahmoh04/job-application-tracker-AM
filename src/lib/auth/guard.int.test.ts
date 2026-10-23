import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import { endsInNotFound, redirectTarget } from "@/test/next";
import { SESSION_ENDED_PATH, currentUser, requireAdmin, requireUser } from "./guard";

// The session comes from here, because next/headers needs a running Next
// request. The account behind it comes from the real database.
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

describe("requireUser", () => {
  it("returns the account behind the session, loaded from the database", async () => {
    expect(await requireUser()).toEqual({ id: me, email: "me@example.com", role: "USER" });
  });

  it("sees a changed role on the very next request, with the same token", async () => {
    expect((await requireUser()).role).toBe("USER");

    await prisma.user.update({ where: { id: me }, data: { role: "ADMIN" } });
    expect((await requireUser()).role).toBe("ADMIN");

    await prisma.user.update({ where: { id: me }, data: { role: "USER" } });
    expect((await requireUser()).role).toBe("USER");
  });

  it("sends a signed-out visitor to sign in", async () => {
    request.session = null;

    expect(await redirectTarget(requireUser())).toBe("/sign-in");
  });

  it("sends a session whose account is gone to have its cookie cleared", async () => {
    await prisma.user.delete({ where: { id: me } });

    expect(await redirectTarget(requireUser())).toBe(SESSION_ENDED_PATH);
  });
});

describe("requireAdmin", () => {
  async function makeMe(role: "USER" | "ADMIN") {
    await prisma.user.update({ where: { id: me }, data: { role } });
  }

  it("lets an admin through", async () => {
    await makeMe("ADMIN");

    expect((await requireAdmin()).role).toBe("ADMIN");
  });

  it("answers everyone else with a 404", async () => {
    expect(await endsInNotFound(requireAdmin())).toBe(true);
  });

  it("closes with the next request once the role is gone, on the same token", async () => {
    await makeMe("ADMIN");
    expect(await endsInNotFound(requireAdmin())).toBe(false);

    await makeMe("USER");
    expect(await endsInNotFound(requireAdmin())).toBe(true);
  });

  it("sends a signed-out visitor and a dead session where requireUser sends them", async () => {
    request.session = null;
    expect(await redirectTarget(requireAdmin())).toBe("/sign-in");

    request.session = { userId: "an-account-that-was-deleted" };
    expect(await redirectTarget(requireAdmin())).toBe(SESSION_ENDED_PATH);
  });
});

describe("currentUser", () => {
  it("answers null instead of redirecting, signed out or with the account gone", async () => {
    request.session = null;
    expect(await currentUser()).toBeNull();

    await prisma.user.delete({ where: { id: me } });
    request.session = { userId: me };
    expect(await currentUser()).toBeNull();
  });
});
