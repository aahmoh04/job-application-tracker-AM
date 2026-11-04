import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * The secret inside a link that a mail carries, for confirming an address and
 * for choosing a new password. The token is 32 random bytes and only ever
 * travels in the mail. The database keeps nothing but its SHA-256 hash, so a
 * copy of the tables opens nothing.
 *
 * A fast hash is enough here, unlike for passwords. A password is something a
 * person can remember, which makes it guessable, and Argon2id is what makes
 * each guess expensive. 32 random bytes cannot be guessed at all, so the only
 * thing the hash has to do is hide the token, and being deterministic lets
 * the link be found by its hash through a unique index.
 */

export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The address a link in a mail points to, with its token in the query. */
export function linkUrl(path: string, token: string): string {
  const url = new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  url.searchParams.set("token", token);
  return url.toString();
}

// A token comes back from the browser, through a bound argument or a hidden
// field, and is client input like any other, see the note in
// lib/applications/actions.ts. Anything but a string of sane length is no token.
export const linkTokenSchema = z.string().min(1).max(200);
