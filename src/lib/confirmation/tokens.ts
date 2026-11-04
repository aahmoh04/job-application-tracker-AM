import { prisma } from "@/lib/db";
import { hashLinkToken, linkUrl, newLinkToken } from "@/lib/link-token";
import { sendMail } from "@/lib/mail/send";
import { confirmationMail } from "./mail";

/**
 * Links that prove someone owns an address. The token is made and stored the
 * way src/lib/link-token.ts describes, only as a hash. A link works for a day
 * and only once, and asking for a new one makes every older link of the
 * account stop working.
 */

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** A fresh link for the account, replacing any earlier one. Returns the token for the mail. */
export async function issueConfirmation(userId: string, now = new Date()): Promise<string> {
  const token = newLinkToken();

  await prisma.$transaction([
    prisma.emailConfirmation.deleteMany({ where: { userId } }),
    prisma.emailConfirmation.create({
      data: {
        userId,
        tokenHash: hashLinkToken(token),
        expiresAt: new Date(now.getTime() + LINK_TTL_MS),
      },
    }),
  ]);

  return token;
}

/** Issues a link and mails it to the account's address. */
export async function sendConfirmation(
  user: { id: string; email: string },
  now = new Date(),
): Promise<void> {
  const token = await issueConfirmation(user.id, now);

  await sendMail(confirmationMail(user.email, linkUrl("/confirm-email", token)));
}

/**
 * The address a link would confirm, or null when the link is unknown, used or
 * expired. It only reads, for the page the link opens.
 */
export async function pendingConfirmation(
  token: string,
  now = new Date(),
): Promise<{ email: string } | null> {
  const row = await prisma.emailConfirmation.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    select: { expiresAt: true, user: { select: { email: true } } },
  });

  return row && row.expiresAt > now ? { email: row.user.email } : null;
}

/**
 * Confirms the address behind a link. True once, false for a link that is
 * unknown, used or expired.
 */
export async function confirmEmail(token: string, now = new Date()): Promise<boolean> {
  const tokenHash = hashLinkToken(token);

  return prisma.$transaction(async (tx) => {
    const row = await tx.emailConfirmation.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });

    if (!row || row.expiresAt <= now) {
      return false;
    }

    // Deleting is what makes a link single-use. Of two clicks at the same
    // moment only one delete finds the row, the other one counts zero.
    const { count } = await tx.emailConfirmation.deleteMany({ where: { tokenHash } });

    if (count === 0) {
      return false;
    }

    await tx.user.updateMany({
      where: { id: row.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });

    // Any other link of the account has done its job as well.
    await tx.emailConfirmation.deleteMany({ where: { userId: row.userId } });

    return true;
  });
}
