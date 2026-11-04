import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { closeRedis } from "@/lib/redis";
import { createUser, resetDatabase } from "@/test/database";
import { freshAddress, inbox } from "@/test/mailpit";
import { redirectTarget } from "@/test/next";
import { resetRedis } from "@/test/redis";
import { confirmEmailAction, resendConfirmation } from "./actions";
import { issueConfirmation } from "./tokens";

// The signed-in user comes from here, because next/headers needs a running
// Next request. Database, Redis and Mailpit are real.
const request = vi.hoisted(() => ({ session: null as SessionPayload | null }));

vi.mock("@/lib/auth/cookies", () => ({
  getSession: async () => request.session,
}));

let me: string;
let address: string;

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  address = freshAddress("resend");
  me = (await createUser(address)).id;
  request.session = { userId: me, sessionVersion: 0 };
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

async function verifiedAt() {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me } });
  return user.emailVerifiedAt;
}

describe("confirmEmailAction", () => {
  it("confirms the address and goes to the dashboard", async () => {
    const token = await issueConfirmation(me);

    expect(await redirectTarget(confirmEmailAction(token))).toBe("/dashboard?confirmed=1");
    expect(await verifiedAt()).not.toBeNull();
  });

  it("works without a session, because the link itself is the proof", async () => {
    request.session = null;
    const token = await issueConfirmation(me);

    expect(await redirectTarget(confirmEmailAction(token))).toBe("/dashboard?confirmed=1");
    expect(await verifiedAt()).not.toBeNull();
  });

  it("sends a used link back to the page, which then says so", async () => {
    const token = await issueConfirmation(me);
    await redirectTarget(confirmEmailAction(token));

    expect(await redirectTarget(confirmEmailAction(token))).toBe("/confirm-email");
  });

  it("treats a token that arrives as anything but a string as invalid", async () => {
    await issueConfirmation(me);

    expect(await redirectTarget(confirmEmailAction({ not: "" }))).toBe("/confirm-email");
    expect(await verifiedAt()).toBeNull();
  });
});

describe("resendConfirmation", () => {
  it("mails a new link, and the older one stops working", async () => {
    const older = await issueConfirmation(me);

    expect(await resendConfirmation()).toEqual({
      message: `A new link is on its way to ${address}. Older links no longer work.`,
    });
    expect(await inbox(address)).toHaveLength(1);
    expect(await redirectTarget(confirmEmailAction(older))).toBe("/confirm-email");
  });

  it("sends nothing for an address that is confirmed already", async () => {
    await prisma.user.update({ where: { id: me }, data: { emailVerifiedAt: new Date() } });

    expect(await resendConfirmation()).toEqual({ message: "Your address is confirmed already." });
    expect(await inbox(address)).toHaveLength(0);
  });

  it("sends three links an hour at most", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await resendConfirmation();
    }

    const fourth = await resendConfirmation();

    expect(fourth.message).toMatch(/^That was a few links already\. Try again in \d+ minutes?\.$/);
    expect(await inbox(address)).toHaveLength(3);
  });

  it("sends a signed-out visitor to sign in", async () => {
    request.session = null;

    expect(await redirectTarget(resendConfirmation())).toBe("/sign-in");
  });
});
