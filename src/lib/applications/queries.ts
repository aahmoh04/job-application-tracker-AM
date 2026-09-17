import { prisma } from "@/lib/db";

/**
 * Every read in here takes a userId and puts it into the `where` clause. That
 * is the whole idea: an application belonging to someone else is not "found
 * and then rejected", it is never loaded in the first place.
 *
 * The alternative, loading by id and comparing afterwards, works until someone
 * forgets the comparison once. This way the guard cannot be forgotten, because
 * there is no function that reads without it.
 */

export function listApplications(userId: string) {
  return prisma.application.findMany({
    where: { userId },
    orderBy: [{ appliedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      role: true,
      status: true,
      source: true,
      appliedAt: true,
      followUpAt: true,
      company: { select: { name: true } },
    },
  });
}

/** Returns null both for "does not exist" and "belongs to someone else". */
export function findApplication(userId: string, id: string) {
  return prisma.application.findFirst({
    where: { id, userId },
    select: {
      id: true,
      role: true,
      status: true,
      source: true,
      salaryMin: true,
      salaryMax: true,
      postingUrl: true,
      notes: true,
      appliedAt: true,
      followUpAt: true,
      company: { select: { name: true } },
      statusEvents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, from: true, to: true, note: true, createdAt: true },
      },
    },
  });
}

export function countApplications(userId: string) {
  return prisma.application.count({ where: { userId } });
}
