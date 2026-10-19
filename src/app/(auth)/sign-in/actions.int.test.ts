import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/test/database";
import { form, redirectTarget } from "@/test/next";
import { signIn } from "./actions";

// The only stand-in. next/headers needs a running Next request, so the cookie
// is caught here. Database, hashing and token signing are all real.
const jar = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/auth/cookies", () => ({
  setSessionCookie: async (token: string) => {
    jar.token = token;
  },
}));

const PASSWORD = "correct horse battery staple";
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  jar.token = null;

  const user = await prisma.user.create({
    data: { email: "me@example.com", passwordHash: await hashPassword(PASSWORD) },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("signIn", () => {
  it("signs in with the right password and returns to the page from next", async () => {
    const target = await redirectTarget(
      signIn(
        {},
        form({ email: "Me@Example.com", password: PASSWORD, next: "/applications/board" }),
      ),
    );

    expect(target).toBe("/applications/board");
    expect(await verifySessionToken(jar.token ?? "")).toEqual({ userId, role: "USER" });
  });

  it("goes to the dashboard when next points somewhere else", async () => {
    const target = await redirectTarget(
      signIn({}, form({ email: "me@example.com", password: PASSWORD, next: "//evil.example" })),
    );

    expect(target).toBe("/dashboard");
  });

  it("answers a wrong password and an unknown address in exactly the same way", async () => {
    const wrongPassword = await signIn(
      {},
      form({ email: "me@example.com", password: "not the password" }),
    );
    const unknownAddress = await signIn(
      {},
      form({ email: "nobody@example.com", password: PASSWORD }),
    );

    expect(wrongPassword).toEqual({
      message: "Email or password is incorrect.",
      values: { email: "me@example.com" },
    });
    expect(unknownAddress).toEqual({
      message: "Email or password is incorrect.",
      values: { email: "nobody@example.com" },
    });
    expect(jar.token).toBeNull();
  });

  it("does not let anyone in through an account that only has GitHub", async () => {
    await prisma.user.create({ data: { email: "github-only@example.com", passwordHash: null } });

    const result = await signIn({}, form({ email: "github-only@example.com", password: PASSWORD }));

    expect(result.message).toBe("Email or password is incorrect.");
    expect(jar.token).toBeNull();
  });
});
