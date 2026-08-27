import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * The doorman. Runs before the route is rendered, on every matching request.
 *
 * Named "proxy" since Next 16, because it sits at a network boundary in front
 * of the app rather than being part of it. That distinction matters: it
 * redirects, it does not authorise. Authorisation belongs where the data is
 * read, which is why every protected page checks the session again itself.
 *
 * It never talks to the database. That is the whole point of a signed token,
 * the signature proves the payload without a lookup.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/applications", "/analytics", "/settings"];
const AUTH_PAGES = ["/sign-in", "/sign-up"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Not signed in, but asking for something private. Remember where they were
  // headed so the sign-in page can send them back afterwards.
  if (isProtected && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in, no reason to see the sign-in or sign-up page.
  if (AUTH_PAGES.includes(pathname) && session) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next's own assets and the favicon.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
