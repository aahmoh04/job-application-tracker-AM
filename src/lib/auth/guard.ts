import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth/cookies";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * The one place that decides who is making a request.
 *
 * The session token only proves an identity. Whether that account still
 * exists, whether the session still counts, and what the account may do comes
 * from the database on every request. A token stays valid for a week, and
 * nothing about an account should take a week to change.
 */

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  /** Null until the address is confirmed. The dashboard asks for it then. */
  emailVerifiedAt: Date | null;
};

/** Where a session goes whose account no longer exists, or whose generation a password reset ended. */
export const SESSION_ENDED_PATH = "/api/auth/session-ended";

/**
 * The account a session belongs to, or null when the account is gone or a
 * password reset has started a new generation of sessions since this one was
 * signed. The version sits in the where clause, so an old token finds no
 * account at all, the same answer as for a deleted one.
 */
export function sessionAccount(session: SessionPayload): Promise<CurrentUser | null> {
  return prisma.user.findUnique({
    where: { id: session.userId, sessionVersion: session.sessionVersion },
    select: { id: true, email: true, role: true, emailVerifiedAt: true },
  });
}

/**
 * The signed-in user, fresh from the database, or null when nobody is signed
 * in or the session no longer counts. cache() lets the layout, the page and
 * generateMetadata share one lookup per request.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();

  return session ? sessionAccount(session) : null;
});

/**
 * The signed-in user, or a redirect that does not return. Every signed-in page
 * and every Server Action that touches applications starts here.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();

  if (user) {
    return user;
  }

  // A valid token whose account is gone, or whose generation has ended, still
  // gets past the proxy, which only checks the signature, and the proxy sends
  // /sign-in straight back to the dashboard while that token is set. So this
  // case goes through a route that clears the cookie first.
  redirect((await getSession()) ? SESSION_ENDED_PATH : "/sign-in");
}

/**
 * The signed-in user, if their role is ADMIN at this moment. Everyone else
 * gets the same 404 as for a page that does not exist, the way a stranger's
 * application answers. Next has forbidden() for a 403, but only behind an
 * experimental flag.
 *
 * The role only ever opens the admin pages. It is no key to anyone's
 * applications, those queries keep their user id like for everyone else.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    notFound();
  }

  return user;
}
