import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * Where requireUser() sends a session whose account no longer exists, see
 * src/lib/auth/guard.ts. Pages cannot change cookies, a Route Handler can, so
 * the dead cookie is cleared here. Without that the proxy would keep sending
 * the sign-in page back to the dashboard, and the dashboard back to sign-in.
 *
 * Only a cookie whose account is really gone gets cleared. Anyone else is sent
 * on, so a link to this address cannot sign a real user out.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const account = session
    ? await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } })
    : null;

  if (account) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  const response = NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
