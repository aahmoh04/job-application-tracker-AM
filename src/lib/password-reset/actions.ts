"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { linkTokenSchema } from "@/lib/link-token";
import {
  PASSWORD_RESETS_PER_ACCOUNT,
  PASSWORD_RESETS_PER_ADDRESS,
  SIGN_IN_FAILURES_PER_ACCOUNT,
  clear,
  hit,
  retryMessage,
} from "@/lib/rate-limit";
import { clientAddress } from "@/lib/request";
import { newPasswordSchema, passwordResetRequestSchema } from "@/lib/validation/auth";
import { completePasswordReset, pendingPasswordReset, sendPasswordReset } from "./tokens";

/** Where a link lands that is no token, used or expired. The page says so and offers a new one. */
const LINK_GONE = "/reset-password";

export type RequestResetState = {
  errors?: { email?: string[] };
  message?: string;
  /** The address as typed, so a failed attempt does not empty the field. */
  values?: { email: string };
  /** Set once the request went through, whether or not an account has the address. */
  sentTo?: string;
};

/**
 * "Forgot your password?" Every valid address gets the same answer, and the
 * mail, if an account has the address, goes out after that answer.
 */
export async function requestPasswordReset(
  _prevState: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const values = { email: (formData.get("email") ?? "").toString() };
  const parsed = passwordResetRequestSchema.safeParse(values);

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const { email } = parsed.data;

  // Both limits count before the lookup and for every address, registered or
  // not, so being stopped says nothing about whether an account exists. The
  // network address comes first, so a sender who is blocked already cannot
  // use up the allowance of someone else's email as well.
  const fromHere = await hit(PASSWORD_RESETS_PER_ADDRESS, await clientAddress());

  if (!fromHere.allowed) {
    return { message: `That was a few links already. ${retryMessage(fromHere)}`, values };
  }

  const forEmail = await hit(PASSWORD_RESETS_PER_ACCOUNT, email);

  if (!forEmail.allowed) {
    return { message: `That was a few links already. ${retryMessage(forEmail)}`, values };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  // The mail goes out once the answer is on its way. Writing the link and
  // talking to the mail provider take a moment, and an answer that came back
  // faster for unknown addresses would tell anyone which ones are registered.
  if (user) {
    after(async () => {
      try {
        await sendPasswordReset(user);
      } catch (error) {
        console.error("Password reset mail failed.", error);
      }
    });
  }

  return { sentTo: email };
}

export type ResetPasswordState = {
  errors?: { password?: string[]; confirmPassword?: string[] };
};

/**
 * The form on the page a reset link opens. Like the confirmation, only this
 * submit changes anything, opening the link does not.
 */
export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  // The token rides along in a hidden field. A link that is no token, used or
  // expired goes to the page that says so, before Argon2id runs for nothing.
  const token = linkTokenSchema.safeParse(formData.get("token"));

  if (!token.success || !(await pendingPasswordReset(token.data))) {
    redirect(LINK_GONE);
  }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // Hashed outside the transaction, which should not hold the link's row
  // while Argon2id spends its 100 ms.
  const passwordHash = await hashPassword(parsed.data.password);
  const account = await completePasswordReset(token.data, passwordHash);

  // Used up in the meantime, by a second tab or a second click.
  if (!account) {
    redirect(LINK_GONE);
  }

  // Wrong guesses may have locked the account. Whoever got here has just
  // proven the address, so the lock has nothing left to protect.
  await clear(SIGN_IN_FAILURES_PER_ACCOUNT, account.email);

  // No automatic sign-in, the new password is used the usual way, as the
  // OWASP Forgot Password Cheat Sheet advises. A session cookie this browser
  // still holds belongs to the generation that just ended, so it goes too.
  await clearSessionCookie();

  redirect("/sign-in?reset=1");
}
