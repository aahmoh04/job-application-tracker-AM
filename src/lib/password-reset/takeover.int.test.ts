import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "@/app/(auth)/sign-in/actions";
import { signUp } from "@/app/(auth)/sign-up/actions";
import { SESSION_ENDED_PATH, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { closeRedis } from "@/lib/redis";
import { resetDatabase } from "@/test/database";
import { freshAddress, inbox, message } from "@/test/mailpit";
import { form, redirectTarget } from "@/test/next";
import { resetRedis } from "@/test/redis";
import { requestPasswordReset, resetPassword } from "./actions";

/**
 * The reason the reset exists, told once from start to end. Someone registers
 * an address that is not theirs and stays signed in. Its owner cannot sign up
 * with it, takes the account over through a reset link, and from then on the
 * stranger has neither a session nor a password that works.
 */

// The cookie jar of the device in use. The test switches devices by putting
// another token into it. Everything else is real, from hashing and token
// signing to Postgres, Redis and Mailpit.
const browser = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/auth/cookies", async () => {
  const { verifySessionToken } = await import("@/lib/auth/session");

  return {
    setSessionCookie: async (token: string) => {
      browser.token = token;
    },
    clearSessionCookie: async () => {
      browser.token = null;
    },
    getSession: async () => (browser.token ? verifySessionToken(browser.token) : null),
  };
});

vi.mock("@/lib/request", () => ({
  clientAddress: async () => "203.0.113.7",
}));

// after() waits for a response that does not exist here, see actions.int.test.ts.
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

/** The token from the reset link in the newest reset mail to this address. */
async function tokenFromResetMail(address: string): Promise<string> {
  const mail = (await inbox(address)).find(
    (entry) => entry.Subject === "Reset your JobTracker password",
  );

  if (!mail) {
    throw new Error("No reset mail arrived.");
  }

  const { Text } = await message(mail.ID);
  return new URL(Text.match(/http\S+/)?.[0] ?? "").searchParams.get("token") ?? "";
}

const STRANGER = "the stranger's own password";
const OWNER = "the owner's new passphrase";

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  browser.token = null;
  later.tasks.splice(0);
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

describe("an address that a stranger registered first", () => {
  it("goes back to its owner through a reset, and the stranger is signed out everywhere", async () => {
    const address = freshAddress("owner");

    // The stranger registers the address and stays signed in.
    await redirectTarget(
      signUp({}, form({ email: address, password: STRANGER, confirmPassword: STRANGER })),
    );
    const strangersDevice = browser.token;
    expect((await requireUser()).email).toBe(address);

    // The owner, on a device of their own, finds the address taken.
    browser.token = null;
    const refused = await signUp(
      {},
      form({ email: address, password: OWNER, confirmPassword: OWNER }),
    );
    expect(refused.errors?.email).toEqual([
      "An account with this email already exists. If it is yours, reset its password.",
    ]);

    // The owner asks for a link, which only the owner's inbox receives.
    expect(await requestPasswordReset({}, form({ email: address }))).toEqual({ sentTo: address });
    await afterResponse();
    const token = await tokenFromResetMail(address);

    expect(
      await redirectTarget(
        resetPassword({}, form({ token, password: OWNER, confirmPassword: OWNER })),
      ),
    ).toBe("/sign-in?reset=1");

    // The stranger's session ends with its very next request.
    browser.token = strangersDevice;
    expect(await redirectTarget(requireUser())).toBe(SESSION_ENDED_PATH);

    // The stranger's password opens nothing anymore, the owner's does.
    browser.token = null;
    expect((await signIn({}, form({ email: address, password: STRANGER }))).message).toBe(
      "Email or password is incorrect.",
    );
    expect(await redirectTarget(signIn({}, form({ email: address, password: OWNER })))).toBe(
      "/dashboard",
    );

    const owner = await requireUser();
    expect(owner.email).toBe(address);
    expect(owner.emailVerifiedAt).not.toBeNull();
  });
});
