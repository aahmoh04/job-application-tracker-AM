import type { Prisma } from "@/generated/prisma/client";
import { Status } from "@/generated/prisma/enums";
import { isTerminal } from "@/lib/pipeline/transitions";

/**
 * A follow-up is due once its date has passed, but only while the application
 * is still open. Nobody chases a rejection or an accepted offer, and counting
 * those would make the number on the dashboard only ever grow.
 *
 * The rule exists twice, once for an application that is already loaded and
 * once as a filter for counting in the database. Both live here so that
 * changing one without the other is hard to miss, and a test holds them
 * together.
 */

const OPEN_STATUSES = Object.values(Status).filter((status) => !isTerminal(status));

export function isFollowUpDue(
  application: { status: Status; followUpAt: Date | null },
  now: Date,
): boolean {
  return (
    application.followUpAt !== null &&
    application.followUpAt < now &&
    !isTerminal(application.status)
  );
}

export function followUpDueFilter(now: Date) {
  return {
    followUpAt: { lt: now },
    status: { in: OPEN_STATUSES },
  } satisfies Prisma.ApplicationWhereInput;
}
