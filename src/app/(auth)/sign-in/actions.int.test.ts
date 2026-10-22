import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/test/database";
import { resetRedis } from "@/test/redis";
import { closeRedis } from "@/lib/redis";
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

// next/headers is not there either, so the visitor's address comes from here.
const visitor = vi.hoisted(() => ({ address: "203.0.113.7" }));

vi.mock("@/lib/request", () => ({
  clientAddress: async () => visitor.address,
}));

const PASSWORD = "correct horse battery staple";
let userId: string;

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  jar.token = null;
  visitor.address = "203.0.113.7";

  const user = await prisma.user.create({
    data: { email: "me@example.com", passwordHash: await hashPassword(PASSWORD) },
  });
  userId = user.id;
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
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
    expect(await verifySessionToken(jar.token ?? "")).toEqual({ userId });
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

describe("signIn under the rate limits", () => {
  const wrong = (email: string) => signIn({}, form({ email, password: "a wrong guess" }));

  it("locks an account after five wrong passwords, even against the right one", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await wrong("me@example.com");
    }

    const result = await signIn({}, form({ email: "me@example.com", password: PASSWORD }));

    expect(result.message).toBe("Too many sign-in attempts. Try again in 15 minutes.");
    expect(jar.token).toBeNull();
  });

  it("locks an unknown address the same way, so a lock reveals nothing", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await wrong("nobody@example.com");
    }

    expect((await wrong("nobody@example.com")).message).toBe(
      "Too many sign-in attempts. Try again in 15 minutes.",
    );
  });

  it("forgets earlier failures once the right password comes in", async () => {
    for (let round = 0; round < 2; round += 1) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await wrong("me@example.com");
      }

      jar.token = null;
      await redirectTarget(signIn({}, form({ email: "me@example.com", password: PASSWORD })));
      expect(jar.token).not.toBeNull();
    }
  });

  it("slows down one address that tries many accounts, and only that address", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wrong(`guess${attempt}@example.com`);
    }

    const blocked = await signIn({}, form({ email: "me@example.com", password: PASSWORD }));
    expect(blocked.message).toBe("Too many sign-in attempts. Try again in 15 minutes.");

    visitor.address = "198.51.100.23";
    const target = await redirectTarget(
      signIn({}, form({ email: "me@example.com", password: PASSWORD })),
    );
    expect(target).toBe("/dashboard");
  }, 20_000);
});
