"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { linkTokenSchema } from "@/lib/link-token";
import { CONFIRMATION_MAILS_PER_ACCOUNT, hit, retryMessage } from "@/lib/rate-limit";
import { confirmEmail, sendConfirmation } from "./tokens";

/**
 * The button on the page a confirmation link opens. Only this click confirms.
 * Opening the link does not, because mail scanners open links on their own.
 * The token arrives through bind, which React writes into the page as a
 * hidden field, so it is parsed like any other input.
 */
export async function confirmEmailAction(token: unknown): Promise<void> {
  const parsed = linkTokenSchema.safeParse(token);
  const confirmed = parsed.success && (await confirmEmail(parsed.data));

  // A used or expired link lands back on the page, which then says so.
  redirect(confirmed ? "/dashboard?confirmed=1" : "/confirm-email");
}

export type ResendState = {
  message?: string;
};

/** "Send the link again" on the dashboard, for an address that is not confirmed yet. */
export async function resendConfirmation(): Promise<ResendState> {
  const user = await requireUser();

  if (user.emailVerifiedAt) {
    return { message: "Your address is confirmed already." };
  }

  // Every link is a mail to an address whose owner has not confirmed it yet,
  // so an account only gets a few of them an hour.
  const verdict = await hit(CONFIRMATION_MAILS_PER_ACCOUNT, user.id);

  if (!verdict.allowed) {
    return { message: `That was a few links already. ${retryMessage(verdict)}` };
  }

  try {
    await sendConfirmation(user);
  } catch (error) {
    console.error("Confirmation mail failed.", error);
    return { message: "The mail could not be sent. Try again in a moment." };
  }

  return { message: `A new link is on its way to ${user.email}. Older links no longer work.` };
}
