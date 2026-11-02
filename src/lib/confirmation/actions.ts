"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { CONFIRMATION_MAILS_PER_ACCOUNT, hit, retryMessage } from "@/lib/rate-limit";
import { confirmEmail, sendConfirmation } from "./tokens";

// The token reaches the action through bind, and React writes bound arguments
// into the page as a hidden field. It is client input like any other, see the
// note in lib/applications/actions.ts.
const tokenSchema = z.string().min(1).max(200);

/**
 * The button on the page a confirmation link opens. Only this click confirms.
 * Opening the link does not, because mail scanners open links on their own.
 */
export async function confirmEmailAction(token: unknown): Promise<void> {
  const parsed = tokenSchema.safeParse(token);
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
