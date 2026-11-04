import { NextResponse, type NextRequest } from "next/server";
import { sessionAccount } from "@/lib/auth/guard";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Where requireUser() sends a session whose account no longer exists, or
 * whose generation a password reset ended, see src/lib/auth/guard.ts. Pages
 * cannot change cookies, a Route Handler can, so the dead cookie is cleared
 * here. Without that the proxy would keep sending the sign-in page back to the
 * dashboard, and the dashboard back to sign-in.
 *
 * Only a cookie whose session really ended gets cleared. Anyone else is sent
 * on, so a link to this address cannot sign a real user out. The question is
 * asked through the same sessionAccount() as in the guard, because two
 * answers to it are exactly what made the loop.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const account = session ? await sessionAccount(session) : null;

  if (account) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  const response = NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
