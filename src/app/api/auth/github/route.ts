import { NextResponse, type NextRequest } from "next/server";
import {
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  deriveCodeChallenge,
  randomUrlSafeToken,
} from "@/lib/auth/oauth/github";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Step one of the flow. Mints two secrets, remembers them in short-lived
 * cookies and sends the visitor to GitHub.
 */
export async function GET(request: NextRequest) {
  const state = randomUrlSafeToken();
  const codeVerifier = randomUrlSafeToken();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);

  // Where to land once GitHub is done. The trip to github.com and back loses
  // every query parameter, so it waits in a cookie, and the callback checks it
  // again because a cookie comes back from the browser like everything else.
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  const response = NextResponse.redirect(buildAuthorizeUrl(state, codeChallenge));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "strict" would drop the cookie on the way back from github.com, because
    // that return trip is a cross-site navigation. "lax" still sends it there,
    // since the return trip is a plain top-level GET.
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);
  response.cookies.set(OAUTH_NEXT_COOKIE, next, cookieOptions);

  return response;
}
