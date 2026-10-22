import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import { GET } from "./route";

/** The request a browser sends, with a session cookie if there is one. */
function requestWith(token?: string) {
  return new NextRequest("http://localhost:3000/api/auth/session-ended", {
    headers: token ? { cookie: `session=${token}` } : {},
  });
}

/** What the response does with the session cookie, if anything. */
function sessionCookie(response: Response) {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("session="));
}

let me: string;

beforeEach(async () => {
  await resetDatabase();
  me = (await createUser("me@example.com")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the session-ended route", () => {
  it("clears the cookie of an account that is gone and sends the visitor to sign in", async () => {
    const token = await createSessionToken({ userId: me });
    await prisma.user.delete({ where: { id: me } });

    const response = await GET(requestWith(token));

    expect(response.headers.get("location")).toBe("http://localhost:3000/sign-in");
    expect(sessionCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("leaves a living account signed in, so a link here signs nobody out", async () => {
    const token = await createSessionToken({ userId: me });

    const response = await GET(requestWith(token));

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(sessionCookie(response)).toBeUndefined();
  });

  it("sends a visitor without a session to sign in", async () => {
    const response = await GET(requestWith());

    expect(response.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });
});
