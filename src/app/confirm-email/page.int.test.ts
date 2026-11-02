import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { issueConfirmation } from "@/lib/confirmation/tokens";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import ConfirmEmailPage from "./page";

let me: string;

beforeEach(async () => {
  await resetDatabase();
  me = (await createUser("me@example.com")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** All text in a rendered tree, enough to see which of its two answers the page gave. */
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(text).join(" ");
  }

  if (node && typeof node === "object" && "props" in node) {
    return text((node as { props: { children?: unknown } }).props.children);
  }

  return "";
}

async function openLink(token?: string) {
  const page = await ConfirmEmailPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  });

  return text(page);
}

describe("the page a confirmation link opens", () => {
  it("shows the address and a button, and opening it confirms nothing", async () => {
    const token = await issueConfirmation(me);

    const page = await openLink(token);
    expect(page).toContain("me@example.com");
    expect(page).toContain("Confirm my address");

    // A mail scanner that opens the link, even twice, changes nothing.
    await openLink(token);
    await openLink(token);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(await prisma.emailConfirmation.count()).toBe(1);
  });

  it("says so when the link is unknown or missing", async () => {
    await issueConfirmation(me);

    expect(await openLink("a-token-nobody-issued")).toContain("This link no longer works");
    expect(await openLink()).toContain("This link no longer works");
  });
});
