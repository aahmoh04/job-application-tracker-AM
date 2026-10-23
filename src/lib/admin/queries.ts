import { Status } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * The numbers behind the admin page, and nothing but numbers. No query in here
 * selects an email, a role title, a company, a note or a link. An admin runs
 * the platform and has no business reading anyone's job search, so the return
 * type has no room for any of it either, only counts and statuses.
 */

const DAY = 86_400_000;

/** How far back "joined recently" looks. */
export const JOINED_WITHIN_DAYS = 30;

/** How far back "active" looks. */
export const ACTIVE_WITHIN_DAYS = 7;

export type PlatformNumbers = {
  accounts: {
    total: number;
    joinedRecently: number;
    /** Added or moved at least one application within ACTIVE_WITHIN_DAYS. */
    active: number;
    admins: number;
    /** Accounts with a password. All others sign in through GitHub only. */
    withPassword: number;
  };
  applications: {
    total: number;
    /** Every status in pipeline order, zeros included. */
    byStatus: { status: Status; count: number }[];
  };
};

export async function platformNumbers(now: Date): Promise<PlatformNumbers> {
  const joinedSince = new Date(now.getTime() - JOINED_WITHIN_DAYS * DAY);
  const activeSince = new Date(now.getTime() - ACTIVE_WITHIN_DAYS * DAY);

  const [total, joinedRecently, active, admins, withPassword, applications, perStatus] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: joinedSince } } }),
      // Every new application and every move writes a status event, so a
      // recent event is what "active" means here.
      prisma.user.count({
        where: {
          applications: { some: { statusEvents: { some: { createdAt: { gte: activeSince } } } } },
        },
      }),
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.user.count({ where: { passwordHash: { not: null } } }),
      prisma.application.count(),
      prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  const counts = new Map(perStatus.map((row) => [row.status, row._count._all]));

  return {
    accounts: { total, joinedRecently, active, admins, withPassword },
    applications: {
      total: applications,
      byStatus: Object.values(Status).map((status) => ({
        status,
        count: counts.get(status) ?? 0,
      })),
    },
  };
}
