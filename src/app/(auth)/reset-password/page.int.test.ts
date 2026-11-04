import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { issuePasswordReset } from "@/lib/password-reset/tokens";
import { createUser, resetDatabase } from "@/test/database";
import { renderedText } from "@/test/render";
import ResetPasswordPage from "./page";

let me: string;

beforeEach(async () => {
  await resetDatabase();
  me = (await createUser("me@example.com")).id;
  await prisma.user.update({ where: { id: me }, data: { passwordHash: "the-old-hash" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openLink(token?: string) {
  const page = await ResetPasswordPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  });

  return renderedText(page);
}

describe("the page a reset link opens", () => {
  it("shows the address and the form, and opening it changes nothing", async () => {
    const token = await issuePasswordReset(me);

    const page = await openLink(token);
    expect(page).toContain("Choose a new password");
    expect(page).toContain("me@example.com");

    // A mail scanner that opens the link, even twice, changes nothing.
    await openLink(token);
    await openLink(token);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me } });
    expect(user.passwordHash).toBe("the-old-hash");
    expect(user.sessionVersion).toBe(0);
    expect(user.emailVerifiedAt).toBeNull();
    expect(await prisma.passwordReset.count()).toBe(1);
  });

  it("says so when the link is unknown or missing", async () => {
    await issuePasswordReset(me);

    expect(await openLink("a-token-nobody-issued")).toContain("This link no longer works");
    expect(await openLink()).toContain("This link no longer works");
  });
});
