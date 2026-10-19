import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/test/database";
import { GET } from "./route";

// Two stand-ins. next/headers needs a running Next request, so the session
// cookie is caught here, and GitHub is replaced by a fake fetch below.
// The state check, the linking rule, the database and the token are real.
const jar = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/auth/cookies", () => ({
  setSessionCookie: async (token: string) => {
    jar.token = token;
  },
}));

const GITHUB_ID = 4242;
const GITHUB_EMAIL = "octocat@example.com";

type GitHubEmail = { email: string; primary: boolean; verified: boolean };

/** Answers the three GitHub endpoints the callback talks to. */
function fakeGitHub(
  emails: GitHubEmail[] = [{ email: GITHUB_EMAIL, primary: true, verified: true }],
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: "gho_test" });
    }
    if (url === "https://api.github.com/user") {
      return Response.json({ id: GITHUB_ID, login: "octocat" });
    }
    if (url === "https://api.github.com/user/emails") {
      return Response.json(emails);
    }

    throw new Error(`Unexpected request to ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The request GitHub sends the browser back with, cookies included. */
function callback({
  state = "the-state",
  cookieState = "the-state",
  next,
}: { state?: string; cookieState?: string; next?: string } = {}) {
  const url = new URL("http://localhost:3000/api/auth/github/callback");
  url.searchParams.set("code", "the-code");
  url.searchParams.set("state", state);

  const cookies = [`github_oauth_state=${cookieState}`, "github_oauth_verifier=the-verifier"];
  if (next) cookies.push(`github_oauth_next=${encodeURIComponent(next)}`);

  return new NextRequest(url, { headers: { cookie: cookies.join("; ") } });
}

async function sessionUserId() {
  return (await verifySessionToken(jar.token ?? ""))?.userId ?? null;
}

beforeEach(async () => {
  await resetDatabase();
  jar.token = null;
  vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the GitHub callback", () => {
  it("rejects a state that does not match before it talks to GitHub", async () => {
    const github = fakeGitHub();

    const response = await GET(callback({ state: "forged", cookieState: "the-state" }));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=oauth_state_mismatch",
    );
    expect(github).not.toHaveBeenCalled();
    expect(jar.token).toBeNull();
  });

  it("creates an account without a password for a new visitor and returns to next", async () => {
    fakeGitHub();

    const response = await GET(callback({ next: "/applications" }));
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: GITHUB_EMAIL },
      include: { accounts: true },
    });

    expect(response.headers.get("location")).toBe("http://localhost:3000/applications");
    expect(user.passwordHash).toBeNull();
    expect(user.accounts).toMatchObject([{ provider: "github", providerAccountId: "4242" }]);
    expect(await sessionUserId()).toBe(user.id);

    // The one-shot cookies are cleared on the way out.
    const cleared = response.headers.getSetCookie().join("\n");
    expect(cleared).toMatch(/github_oauth_state=;/);
    expect(cleared).toMatch(/github_oauth_verifier=;/);
    expect(cleared).toMatch(/github_oauth_next=;/);
  });

  it("signs a returning GitHub account into the same user", async () => {
    fakeGitHub();
    const existing = await prisma.user.create({
      data: {
        email: "renamed@example.com",
        accounts: { create: { provider: "github", providerAccountId: String(GITHUB_ID) } },
      },
    });

    const response = await GET(callback());

    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(await sessionUserId()).toBe(existing.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.account.count()).toBe(1);
  });

  it("links onto an existing account that has no password", async () => {
    fakeGitHub();
    const existing = await prisma.user.create({
      data: { email: GITHUB_EMAIL, passwordHash: null },
    });

    await GET(callback());

    expect(await sessionUserId()).toBe(existing.id);
    expect(await prisma.account.findMany({ where: { userId: existing.id } })).toHaveLength(1);
  });

  it("refuses to link onto an account with a password and writes nothing", async () => {
    fakeGitHub();
    await prisma.user.create({
      data: { email: GITHUB_EMAIL, passwordHash: await hashPassword("somebody else's password") },
    });

    const response = await GET(callback());

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=oauth_account_exists",
    );
    expect(await prisma.account.count()).toBe(0);
    expect(jar.token).toBeNull();
  });

  it("turns away a GitHub account without a verified address", async () => {
    fakeGitHub([{ email: GITHUB_EMAIL, primary: true, verified: false }]);

    const response = await GET(callback());

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=oauth_no_verified_email",
    );
    expect(await prisma.user.count()).toBe(0);
    expect(jar.token).toBeNull();
  });
});
