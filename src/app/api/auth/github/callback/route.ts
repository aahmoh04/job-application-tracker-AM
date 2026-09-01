import { NextResponse, type NextRequest } from "next/server";
import { setSessionCookie } from "@/lib/auth/cookies";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  exchangeCodeForAccessToken,
  fetchGitHubIdentity,
} from "@/lib/auth/oauth/github";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const PROVIDER = "github";

function failure(request: NextRequest, reason: string) {
  const url = new URL("/sign-in", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/**
 * Step two. GitHub sends the visitor back here with a code. Everything from
 * here on happens server to server.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  // The user pressed "Cancel" on GitHub's consent screen.
  if (request.nextUrl.searchParams.get("error")) {
    return failure(request, "oauth_cancelled");
  }

  // The state we handed out has to come back unchanged. Without this check
  // anyone could send a victim a prepared callback URL carrying their own
  // code, and the victim would end up signed into the attacker's account.
  if (!state || !expectedState || state !== expectedState) {
    return failure(request, "oauth_state_mismatch");
  }

  if (!code || !codeVerifier) {
    return failure(request, "oauth_incomplete");
  }

  const accessToken = await exchangeCodeForAccessToken(code, codeVerifier);

  if (!accessToken) {
    return failure(request, "oauth_exchange_failed");
  }

  const identity = await fetchGitHubIdentity(accessToken);

  if (!identity) {
    return failure(request, "oauth_no_verified_email");
  }

  const user = await linkOrCreateUser(identity.providerAccountId, identity.email);

  const sessionToken = await createSessionToken({ userId: user.id, role: user.role });
  await setSessionCookie(sessionToken);

  const response = NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));

  // The two one-shot cookies have done their job.
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_VERIFIER_COOKIE);

  return response;
}

/**
 * Three cases, in this order:
 *
 * 1. This GitHub account signed in here before, use its user.
 * 2. Someone with this email already exists, attach GitHub to that account.
 *    Safe only because the address came back verified from GitHub.
 * 3. Nobody matches, create a user without a password hash.
 */
async function linkOrCreateUser(providerAccountId: string, email: string) {
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: PROVIDER, providerAccountId },
    },
    select: { user: { select: { id: true, role: true } } },
  });

  if (existingAccount) {
    return existingAccount.user;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existingUser) {
    await prisma.account.create({
      data: { userId: existingUser.id, provider: PROVIDER, providerAccountId },
    });

    return existingUser;
  }

  return prisma.user.create({
    data: {
      email,
      // No password. This account can only be reached through GitHub until the
      // user sets one, which is why passwordHash is nullable in the schema.
      passwordHash: null,
      accounts: {
        create: { provider: PROVIDER, providerAccountId },
      },
    },
    select: { id: true, role: true },
  });
}
