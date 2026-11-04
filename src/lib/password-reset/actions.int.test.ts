import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { SIGN_IN_FAILURES_PER_ACCOUNT, hit, peek } from "@/lib/rate-limit";
import { closeRedis } from "@/lib/redis";
import { resetDatabase } from "@/test/database";
import { freshAddress, inbox } from "@/test/mailpit";
import { form, redirectTarget } from "@/test/next";
import { resetRedis } from "@/test/redis";
import { requestPasswordReset, resetPassword } from "./actions";
import { issuePasswordReset, pendingPasswordReset } from "./tokens";

// next/headers needs a running Next request, so the cookie and the visitor's
// address come from here. Database, Redis, Mailpit and hashing are real.
const browser = vi.hoisted(() => ({ cookieCleared: false }));

vi.mock("@/lib/auth/cookies", () => ({
  clearSessionCookie: async () => {
    browser.cookieCleared = true;
  },
}));

const visitor = vi.hoisted(() => ({ address: "203.0.113.7" }));

vi.mock("@/lib/request", () => ({
  clientAddress: async () => visitor.address,
}));

// after() runs its task once Next has sent the response, and here there is no
// response. The tasks wait in this queue until a test runs them, which also
// lets a test look at what had happened before the answer went out.
const later = vi.hoisted(() => ({ tasks: [] as (() => unknown)[] }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    later.tasks.push(task);
  },
}));

async function afterResponse() {
  for (const task of later.tasks.splice(0)) {
    await task();
  }
}

const OLD_PASSWORD = "the password from before";
const NEW_PASSWORD = "a brand new passphrase";

let me: string;
let address: string;

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  browser.cookieCleared = false;
  visitor.address = "203.0.113.7";
  later.tasks.splice(0);

  address = freshAddress("forgot");
  const user = await prisma.user.create({
    data: { email: address, passwordHash: await hashPassword(OLD_PASSWORD) },
  });
  me = user.id;
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

function account() {
  return prisma.user.findUniqueOrThrow({ where: { id: me } });
}

describe("requestPasswordReset", () => {
  it("answers a registered and an unknown address the same way, and mails only the registered one", async () => {
    const unknown = freshAddress("nobody");

    expect(await requestPasswordReset({}, form({ email: address }))).toEqual({ sentTo: address });
    expect(await requestPasswordReset({}, form({ email: unknown }))).toEqual({ sentTo: unknown });

    await afterResponse();

    expect((await inbox(address)).map((mail) => mail.Subject)).toEqual([
      "Reset your JobTracker password",
    ]);
    expect(await inbox(unknown)).toHaveLength(0);
  });

  it("writes and sends nothing before the answer is out", async () => {
    await requestPasswordReset({}, form({ email: address }));

    expect(await prisma.passwordReset.count()).toBe(0);
    expect(await inbox(address)).toHaveLength(0);

    await afterResponse();

    expect(await prisma.passwordReset.count()).toBe(1);
    expect(await inbox(address)).toHaveLength(1);
  });

  it("finds the account whatever the spelling of the address", async () => {
    const result = await requestPasswordReset({}, form({ email: ` ${address.toUpperCase()} ` }));
    await afterResponse();

    expect(result).toEqual({ sentTo: address });
    expect(await inbox(address)).toHaveLength(1);
  });

  it("explains an address that is not one, and sends nothing", async () => {
    const result = await requestPasswordReset({}, form({ email: "not an address" }));

    expect(result).toEqual({
      errors: { email: ["Please enter a valid email address."] },
      values: { email: "not an address" },
    });
    expect(later.tasks).toHaveLength(0);
  });

  it("sends three links an hour for one email at most, and stops an unknown email the same way", async () => {
    const unknown = freshAddress("nobody");

    for (const email of [address, unknown]) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await requestPasswordReset({}, form({ email }))).sentTo).toBe(email);
      }

      const fourth = await requestPasswordReset({}, form({ email }));
      expect(fourth.message).toMatch(
        /^That was a few links already\. Try again in \d+ minutes?\.$/,
      );
    }

    await afterResponse();
    expect(await inbox(address)).toHaveLength(3);
  });

  it("stops one network address after ten requests, and its blocked ones count for nobody's email", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await requestPasswordReset({}, form({ email: freshAddress(`guess${attempt}`) }));
    }

    const blocked = await requestPasswordReset({}, form({ email: address }));
    expect(blocked.message).toMatch(/^That was a few links already\./);

    // From somewhere else the owner still gets all three links of the hour.
    visitor.address = "198.51.100.23";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await requestPasswordReset({}, form({ email: address }))).sentTo).toBe(address);
    }
  });
});

describe("resetPassword", () => {
  it("saves the new password, ends every session and sends the visitor to sign in", async () => {
    const token = await issuePasswordReset(me);

    const target = await redirectTarget(
      resetPassword({}, form({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })),
    );

    const user = await account();
    expect(target).toBe("/sign-in?reset=1");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(user.passwordHash ?? "", NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(user.passwordHash ?? "", OLD_PASSWORD)).toBe(false);
    expect(user.sessionVersion).toBe(1);
    expect(browser.cookieCleared).toBe(true);
  });

  it("explains a new password that does not fit, and keeps the link working", async () => {
    const token = await issuePasswordReset(me);

    expect(
      await resetPassword({}, form({ token, password: "too short", confirmPassword: "too short" })),
    ).toEqual({ errors: { password: ["Use at least 12 characters."] } });

    expect(
      await resetPassword(
        {},
        form({ token, password: NEW_PASSWORD, confirmPassword: "a different passphrase" }),
      ),
    ).toEqual({ errors: { confirmPassword: ["The two passwords do not match."] } });

    const user = await account();
    expect(await verifyPassword(user.passwordHash ?? "", OLD_PASSWORD)).toBe(true);
    expect(user.sessionVersion).toBe(0);
    expect(await pendingPasswordReset(token)).toEqual({ email: address });
    expect(browser.cookieCleared).toBe(false);
  });

  it("sends a used link, and a form without a token, to the page that says so", async () => {
    const token = await issuePasswordReset(me);
    await redirectTarget(
      resetPassword({}, form({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })),
    );
    browser.cookieCleared = false;

    const again = "yet another passphrase";
    expect(
      await redirectTarget(
        resetPassword({}, form({ token, password: again, confirmPassword: again })),
      ),
    ).toBe("/reset-password");
    expect(
      await redirectTarget(resetPassword({}, form({ password: again, confirmPassword: again }))),
    ).toBe("/reset-password");

    // The link is checked before the password, so a dead link never gets as
    // far as the rules or as Argon2id.
    expect(
      await redirectTarget(
        resetPassword({}, form({ token, password: "short", confirmPassword: "short" })),
      ),
    ).toBe("/reset-password");

    const user = await account();
    expect(await verifyPassword(user.passwordHash ?? "", NEW_PASSWORD)).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(browser.cookieCleared).toBe(false);
  });

  it("lifts the sign-in lock that wrong guesses put on the account", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await hit(SIGN_IN_FAILURES_PER_ACCOUNT, address);
    }
    expect((await peek(SIGN_IN_FAILURES_PER_ACCOUNT, address)).allowed).toBe(false);

    const token = await issuePasswordReset(me);
    await redirectTarget(
      resetPassword({}, form({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })),
    );

    expect((await peek(SIGN_IN_FAILURES_PER_ACCOUNT, address)).allowed).toBe(true);
  });
});
