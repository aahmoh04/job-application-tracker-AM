import { SignJWT, jwtVerify } from "jose";

/**
 * Token handling only. Nothing in here touches cookies or the database, which
 * is what keeps it usable from the middleware. Middleware runs in Next's Edge
 * runtime, where `next/headers` and native modules are unavailable, so `jose`
 * on top of Web Crypto is the one option that works on both sides.
 *
 * The token says who someone is and nothing about what they may do. A role
 * written into it would stay there for the week the token is valid, so an
 * admin who loses the role would keep it until then. The role is read from
 * the database on every request instead, see src/lib/auth/guard.ts.
 *
 * Next to the id it carries the account's session version from the moment it
 * was signed. That is no permission, it says which generation of sessions the
 * token belongs to. A password reset starts a new generation, and the guard
 * turns away every token from an older one, like a new lock that no old key
 * fits anymore.
 */

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // one week

export type SessionPayload = {
  userId: string;
  /** User.sessionVersion when the session started. */
  sessionVersion: number;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: SessionPayload): Promise<string> {
  return new SignJWT({ sessionVersion: session.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Returns null for anything that is not a valid, unexpired token signed by us.
 * A wrong signature, a tampered payload and an expired token are all the same
 * answer to the caller: this person is not signed in.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });

    // Tokens signed before there were session versions carry none. They
    // belong to the first generation, version 0, which every account starts
    // in, so the first password reset ends them as well.
    const sessionVersion = payload.sessionVersion ?? 0;

    if (
      typeof payload.sub !== "string" ||
      typeof sessionVersion !== "number" ||
      !Number.isInteger(sessionVersion)
    ) {
      return null;
    }

    // Tokens from before the role moved out still carry one. Like everything
    // else in the payload besides the subject and the version, it is ignored.
    return { userId: payload.sub, sessionVersion };
  } catch {
    return null;
  }
}
