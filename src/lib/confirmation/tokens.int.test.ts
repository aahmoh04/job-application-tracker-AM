import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import { freshAddress, inbox, message } from "@/test/mailpit";
import { confirmEmail, issueConfirmation, pendingConfirmation, sendConfirmation } from "./tokens";

const DAY = 86_400_000;

let me: string;
let address: string;

beforeEach(async () => {
  await resetDatabase();
  address = freshAddress("confirm");
  me = (await createUser(address)).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function verifiedAt() {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me } });
  return user.emailVerifiedAt;
}

describe("confirmation links", () => {
  it("leave only a hash of the token in the database", async () => {
    const token = await issueConfirmation(me);
    const rows = await prisma.emailConfirmation.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("show the address while the link is valid, and change nothing by it", async () => {
    const token = await issueConfirmation(me);

    expect(await pendingConfirmation(token)).toEqual({ email: address });
    expect(await pendingConfirmation(token)).toEqual({ email: address });
    expect(await verifiedAt()).toBeNull();
  });

  it("confirm the address once and then stop working", async () => {
    const token = await issueConfirmation(me);

    expect(await confirmEmail(token)).toBe(true);
    expect(await verifiedAt()).not.toBeNull();

    expect(await confirmEmail(token)).toBe(false);
    expect(await pendingConfirmation(token)).toBeNull();
    expect(await prisma.emailConfirmation.count()).toBe(0);
  });

  it("expire after a day", async () => {
    const issued = new Date("2026-11-02T10:00:00Z");
    const token = await issueConfirmation(me, issued);

    expect(await pendingConfirmation(token, new Date(issued.getTime() + DAY - 1))).toEqual({
      email: address,
    });

    const tooLate = new Date(issued.getTime() + DAY + 1);
    expect(await pendingConfirmation(token, tooLate)).toBeNull();
    expect(await confirmEmail(token, tooLate)).toBe(false);
    expect(await verifiedAt()).toBeNull();
  });

  it("stop working once a newer link has been sent", async () => {
    const older = await issueConfirmation(me);
    const newer = await issueConfirmation(me);

    expect(await confirmEmail(older)).toBe(false);
    expect(await confirmEmail(newer)).toBe(true);
  });

  it("do nothing for a token nobody issued", async () => {
    await issueConfirmation(me);

    expect(await confirmEmail("a-token-nobody-issued")).toBe(false);
    expect(await verifiedAt()).toBeNull();
  });

  it("arrive by mail with a link that confirms the address", async () => {
    await sendConfirmation({ id: me, email: address });

    const delivered = await inbox(address);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].Subject).toBe("Confirm your email address for JobTracker");

    const { Text } = await message(delivered[0].ID);
    const link = new URL(Text.match(/http\S+/)?.[0] ?? "");
    expect(`${link.origin}${link.pathname}`).toBe("http://localhost:3000/confirm-email");

    expect(await confirmEmail(link.searchParams.get("token") ?? "")).toBe(true);
    expect(await verifiedAt()).not.toBeNull();
  });
});
