import type { Prisma } from "@/generated/prisma/client";
import { followUpDueFilter } from "@/lib/applications/follow-up";
import { prisma } from "@/lib/db";
import { sendMail, type Mail } from "@/lib/mail/send";
import { reminderMail } from "./mail";

/**
 * The daily reminder run. Every user with follow-ups that came due gets one
 * mail that lists all of them, and each follow-up is mentioned only once.
 *
 * Idempotent through reminderSentAt. A user's due follow-ups are claimed in a
 * single UPDATE that only matches rows whose reminderSentAt is still empty,
 * and only then does the mail go out. A second run finds nothing left to
 * claim, whether it comes a minute later or at the very same moment. Of two
 * simultaneous UPDATEs Postgres lets the second wait for the first and then
 * checks the condition again.
 *
 * At most once, on purpose. When sending fails, the claim is given back and
 * the next run tries again. Only a crash in the moment between claim and send
 * loses a reminder. Sending first and claiming after would turn that same
 * crash into a duplicate, and two overlapping runs into two mails every time.
 */

export type ReminderRun = {
  /** Users who had something due when the run started. */
  users: number;
  mails: number;
  /** Mails that could not be sent. Their follow-ups wait for the next run. */
  failed: number;
};

export async function sendDueReminders(
  now: Date,
  send: (mail: Mail) => Promise<void> = sendMail,
): Promise<ReminderRun> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Due, not reminded of yet, and only for addresses someone has proven to
  // own. Sign-up does not confirm addresses yet, and mail to an address that
  // a stranger registered would be spam with this app's name on it.
  const due = {
    ...followUpDueFilter(now),
    reminderSentAt: null,
    user: { emailVerifiedAt: { not: null } },
  } satisfies Prisma.ApplicationWhereInput;

  const users = await prisma.application.findMany({
    where: due,
    distinct: ["userId"],
    select: { userId: true },
  });

  let mails = 0;
  let failed = 0;

  for (const { userId } of users) {
    const claimed = await prisma.application.updateManyAndReturn({
      where: { ...due, userId },
      data: { reminderSentAt: now },
      select: { id: true },
    });

    if (claimed.length === 0) {
      // Another run got there first.
      continue;
    }

    const ids = claimed.map((row) => row.id);

    try {
      const [user, items] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
        prisma.application.findMany({
          where: { id: { in: ids } },
          select: { id: true, role: true, followUpAt: true, company: { select: { name: true } } },
          orderBy: { followUpAt: "asc" },
        }),
      ]);

      await send(
        reminderMail(
          user.email,
          items.map((item) => ({
            id: item.id,
            role: item.role,
            company: item.company.name,
            followUpAt: item.followUpAt ?? now,
          })),
          appUrl,
        ),
      );

      mails += 1;
    } catch (error) {
      failed += 1;
      console.error("Reminder mail failed, its follow-ups wait for the next run.", error);

      // Back to unclaimed, but only the rows this run claimed itself.
      await prisma.application.updateMany({
        where: { id: { in: ids }, reminderSentAt: now },
        data: { reminderSentAt: null },
      });
    }
  }

  return { users: users.length, mails, failed };
}
