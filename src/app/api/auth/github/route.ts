import { NextResponse } from "next/server";
import {
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  deriveCodeChallenge,
  randomUrlSafeToken,
} from "@/lib/auth/oauth/github";

/**
 * Step one of the flow. Mints two secrets, remembers them in short-lived
 * cookies and sends the visitor to GitHub.
 */
export async function GET() {
  const state = randomUrlSafeToken();
  const codeVerifier = randomUrlSafeToken();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  const response = NextResponse.redirect(buildAuthorizeUrl(state, codeChallenge));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" would drop the cookie on the way back from github.com, because
    // that return trip is a cross-site navigation.
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  return response;
}
