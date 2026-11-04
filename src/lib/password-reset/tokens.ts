import { prisma } from "@/lib/db";
import { hashLinkToken, linkUrl, newLinkToken } from "@/lib/link-token";
import { sendMail } from "@/lib/mail/send";
import { passwordResetMail } from "./mail";

/**
 * Links that let the owner of an address choose a new password. Made and
 * stored like confirmation links, only as a hash, see src/lib/link-token.ts.
 * A link works for an hour and only once, and a newer link replaces every
 * older one of the account. An hour rather than a day, because this link opens
 * the whole account, and a mail can sit in an inbox for a long time.
 */

const LINK_TTL_MS = 60 * 60 * 1000;

/** A fresh link for the account, replacing any earlier one. Returns the token for the mail. */
export async function issuePasswordReset(userId: string, now = new Date()): Promise<string> {
  const token = newLinkToken();

  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId } }),
    prisma.passwordReset.create({
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
export async function sendPasswordReset(
  user: { id: string; email: string },
  now = new Date(),
): Promise<void> {
  const token = await issuePasswordReset(user.id, now);

  await sendMail(passwordResetMail(user.email, linkUrl("/reset-password", token)));
}

/**
 * The address a link belongs to, or null when the link is unknown, used or
 * expired. It only reads, for the page the link opens.
 */
export async function pendingPasswordReset(
  token: string,
  now = new Date(),
): Promise<{ email: string } | null> {
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    select: { expiresAt: true, user: { select: { email: true } } },
  });

  return row && row.expiresAt > now ? { email: row.user.email } : null;
}

/**
 * Sets the new password behind a link. Returns the account's address once,
 * and null for a link that is unknown, used or expired. Everything happens in
 * one transaction, so a reset is either complete or did not happen.
 */
export async function completePasswordReset(
  token: string,
  passwordHash: string,
  now = new Date(),
): Promise<{ email: string } | null> {
  const tokenHash = hashLinkToken(token);

  return prisma.$transaction(async (tx) => {
    const row = await tx.passwordReset.findUnique({
      where: { tokenHash },
      select: { userId: true, expiresAt: true },
    });

    if (!row || row.expiresAt <= now) {
      return null;
    }

    // Deleting is what makes a link single-use. Of two clicks at the same
    // moment only one delete finds the row, the other one counts zero.
    const { count } = await tx.passwordReset.deleteMany({ where: { tokenHash } });

    if (count === 0) {
      return null;
    }

    // The new password, and a new generation of sessions. Every session from
    // before stops working with its next request, on any device, including
    // one that belongs to whoever registered this address before its owner.
    const user = await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { email: true },
    });

    // The link arrived by mail, so whoever followed it owns the address.
    await tx.user.updateMany({
      where: { id: row.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });

    // Older reset links have done their job, and confirmation links have
    // nothing left to confirm.
    await tx.passwordReset.deleteMany({ where: { userId: row.userId } });
    await tx.emailConfirmation.deleteMany({ where: { userId: row.userId } });

    return { email: user.email };
  });
}
