import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
  type SessionPayload,
} from "./session";

/**
 * Cookie handling, separated from token handling because `next/headers` only
 * exists in Server Components, Server Actions and Route Handlers. The
 * middleware reads cookies off the request object instead.
 */

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    // Not readable from JavaScript. An XSS hole on the page still cannot steal
    // the session, because document.cookie never sees this one.
    httpOnly: true,
    // HTTPS only, except on localhost where there is no certificate.
    secure: process.env.NODE_ENV === "production",
    // Not sent along with cross-site requests, which is the CSRF defence.
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** The session of whoever is making the current request, or null. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  return verifySessionToken(token);
}
