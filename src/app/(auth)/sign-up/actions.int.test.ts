import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/test/database";
import { form, redirectTarget } from "@/test/next";
import { signUp } from "./actions";

// The only stand-in. next/headers needs a running Next request, so the cookie
// is caught here. Database, hashing and token signing are all real.
const jar = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/auth/cookies", () => ({
  setSessionCookie: async (token: string) => {
    jar.token = token;
  },
}));

const PASSWORD = "a long and boring passphrase";

beforeEach(async () => {
  await resetDatabase();
  jar.token = null;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("signUp", () => {
  it("creates the account with an Argon2id hash, signs in and goes to the dashboard", async () => {
    const target = await redirectTarget(
      signUp(
        {},
        form({ email: "  New.Person@Example.com ", password: PASSWORD, confirmPassword: PASSWORD }),
      ),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "new.person@example.com" },
    });

    expect(target).toBe("/dashboard");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(await verifySessionToken(jar.token ?? "")).toEqual({ userId: user.id, role: "USER" });
  });

  it("refuses a taken address, whatever its spelling, and keeps what was typed", async () => {
    await prisma.user.create({ data: { email: "taken@example.com", passwordHash: "x" } });

    const result = await signUp(
      {},
      form({ email: "Taken@Example.com", password: PASSWORD, confirmPassword: PASSWORD }),
    );

    expect(result).toEqual({
      errors: { email: ["An account with this email already exists."] },
      values: { email: "Taken@Example.com" },
    });
    expect(await prisma.user.count()).toBe(1);
    expect(jar.token).toBeNull();
  });

  it("explains what is wrong with the input and writes nothing", async () => {
    const result = await signUp(
      {},
      form({ email: "person@example.com", password: "too short", confirmPassword: "different" }),
    );

    expect(result.errors?.password).toEqual(["Use at least 12 characters."]);
    expect(result.values).toEqual({ email: "person@example.com" });
    expect(await prisma.user.count()).toBe(0);
    expect(jar.token).toBeNull();
  });
});
