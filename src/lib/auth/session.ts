import { SignJWT, jwtVerify } from "jose";

/**
 * Token handling only. Nothing in here touches cookies or the database, which
 * is what keeps it usable from the middleware. Middleware runs in Next's Edge
 * runtime, where `next/headers` and native modules are unavailable, so `jose`
 * on top of Web Crypto is the one option that works on both sides.
 */

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // one week

export type SessionPayload = {
  userId: string;
  role: string;
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
  return new SignJWT({ role: session.role })
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

    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      return null;
    }

    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
