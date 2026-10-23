import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";

/**
 * The one place that decides who is making a request.
 *
 * The session token only proves an identity. Whether that account still
 * exists, and what it may do, comes from the database on every request. A
 * token stays valid for a week, and nothing about an account should take a
 * week to change.
 */

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
};

/** Where a session goes whose account no longer exists. */
export const SESSION_ENDED_PATH = "/api/auth/session-ended";

/**
 * The signed-in user, fresh from the database, or null when nobody is signed
 * in or the account is gone. cache() lets the layout, the page and
 * generateMetadata share one lookup per request.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true },
  });
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

  // A valid token whose account is gone still gets past the proxy, and the
  // proxy sends /sign-in straight back to the dashboard while that token is
  // set. So this case goes through a route that clears the cookie first.
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
