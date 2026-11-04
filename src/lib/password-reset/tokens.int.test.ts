import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { issueConfirmation } from "@/lib/confirmation/tokens";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import { freshAddress, inbox, message } from "@/test/mailpit";
import {
  completePasswordReset,
  issuePasswordReset,
  pendingPasswordReset,
  sendPasswordReset,
} from "./tokens";

const HOUR = 3_600_000;

let me: string;
let address: string;

beforeEach(async () => {
  await resetDatabase();
  address = freshAddress("reset");
  me = (await createUser(address)).id;
  await prisma.user.update({ where: { id: me }, data: { passwordHash: "the-old-hash" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function account() {
  return prisma.user.findUniqueOrThrow({
    where: { id: me },
    select: { passwordHash: true, sessionVersion: true, emailVerifiedAt: true },
  });
}

describe("reset links", () => {
  it("leave only a hash of the token in the database", async () => {
    const token = await issuePasswordReset(me);
    const rows = await prisma.passwordReset.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("show the address while the link is valid, and change nothing by it", async () => {
    const token = await issuePasswordReset(me);

    expect(await pendingPasswordReset(token)).toEqual({ email: address });
    expect(await pendingPasswordReset(token)).toEqual({ email: address });
    expect(await account()).toEqual({
      passwordHash: "the-old-hash",
      sessionVersion: 0,
      emailVerifiedAt: null,
    });
  });

  it("set the new password once, end every older session and confirm the address", async () => {
    const token = await issuePasswordReset(me);

    expect(await completePasswordReset(token, "the-new-hash")).toEqual({ email: address });

    const after = await account();
    expect(after.passwordHash).toBe("the-new-hash");
    expect(after.sessionVersion).toBe(1);
    expect(after.emailVerifiedAt).not.toBeNull();

    expect(await completePasswordReset(token, "a-third-hash")).toBeNull();
    expect((await account()).passwordHash).toBe("the-new-hash");
    expect(await pendingPasswordReset(token)).toBeNull();
    expect(await prisma.passwordReset.count()).toBe(0);
  });

  it("keep the date of an address that was confirmed before", async () => {
    const confirmed = new Date("2026-10-01T08:00:00Z");
    await prisma.user.update({ where: { id: me }, data: { emailVerifiedAt: confirmed } });

    await completePasswordReset(await issuePasswordReset(me), "the-new-hash");

    expect((await account()).emailVerifiedAt).toEqual(confirmed);
  });

  it("start a new generation with every reset", async () => {
    await completePasswordReset(await issuePasswordReset(me), "the-new-hash");
    await completePasswordReset(await issuePasswordReset(me), "the-newer-hash");

    expect((await account()).sessionVersion).toBe(2);
  });

  it("expire after an hour", async () => {
    const issued = new Date("2026-11-04T10:00:00Z");
    const token = await issuePasswordReset(me, issued);

    expect(await pendingPasswordReset(token, new Date(issued.getTime() + HOUR - 1))).toEqual({
      email: address,
    });

    const tooLate = new Date(issued.getTime() + HOUR + 1);
    expect(await pendingPasswordReset(token, tooLate)).toBeNull();
    expect(await completePasswordReset(token, "the-new-hash", tooLate)).toBeNull();
    expect((await account()).passwordHash).toBe("the-old-hash");
  });

  it("stop working once a newer link has been sent", async () => {
    const older = await issuePasswordReset(me);
    const newer = await issuePasswordReset(me);

    expect(await completePasswordReset(older, "the-new-hash")).toBeNull();
    expect(await completePasswordReset(newer, "the-new-hash")).toEqual({ email: address });
  });

  it("do nothing for a token nobody issued", async () => {
    await issuePasswordReset(me);

    expect(await completePasswordReset("a-token-nobody-issued", "the-new-hash")).toBeNull();
    expect(await account()).toEqual({
      passwordHash: "the-old-hash",
      sessionVersion: 0,
      emailVerifiedAt: null,
    });
  });

  it("clear the confirmation links of the account, the address is confirmed now", async () => {
    await issueConfirmation(me);

    await completePasswordReset(await issuePasswordReset(me), "the-new-hash");

    expect(await prisma.emailConfirmation.count()).toBe(0);
  });

  it("arrive by mail with a link to the reset page", async () => {
    await sendPasswordReset({ id: me, email: address });

    const delivered = await inbox(address);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].Subject).toBe("Reset your JobTracker password");

    const { Text } = await message(delivered[0].ID);
    const link = new URL(Text.match(/http\S+/)?.[0] ?? "");
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:3000/reset-password");
    expect(await pendingPasswordReset(link.searchParams.get("token") ?? "")).toEqual({
      email: address,
    });
  });
});
