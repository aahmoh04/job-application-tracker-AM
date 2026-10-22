"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  SIGN_IN_ATTEMPTS_PER_ADDRESS,
  SIGN_IN_FAILURES_PER_ACCOUNT,
  clear,
  hit,
  peek,
  retryMessage,
  type Verdict,
} from "@/lib/rate-limit";
import { clientAddress } from "@/lib/request";
import { signInSchema } from "@/lib/validation/auth";

/**
 * A real Argon2id digest of a password nobody knows. When the email does not
 * exist, we verify against this instead of returning early, so a wrong email
 * costs exactly as much time as a wrong password. Without it, the response
 * time alone would tell an attacker which addresses are registered.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$tpwO+MVLH7dfTF/Cl2Bkmw$qifVDTNIW1cUv0HZeEB6UcjJS3zzQvV2KHYBKbQNego";

export type SignInState = {
  errors?: {
    email?: string[];
    password?: string[];
  };
  message?: string;
  /** The email as typed. Never the password, that one does not go back to the page. */
  values?: { email: string };
};

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  // React resets a form once its action has run. Sending the address back
  // lets the form show it again, so a mistyped password does not cost the
  // email as well.
  const values = { email: (formData.get("email") ?? "").toString() };

  const parsed = signInSchema.safeParse({
    email: values.email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const { email, password } = parsed.data;

  // Two limits, checked before the password, which is the expensive part. The
  // one per address slows down someone trying many accounts, the one per
  // account stops guessing at a single password from any number of
  // addresses. The account limit only counts failures, see below, and it
  // counts them for addresses that do not exist as well. Otherwise being
  // blocked would itself reveal that an account is real.
  const [fromHere, forAccount] = await Promise.all([
    hit(SIGN_IN_ATTEMPTS_PER_ADDRESS, await clientAddress()),
    peek(SIGN_IN_FAILURES_PER_ACCOUNT, email),
  ]);
  const blocked = [fromHere, forAccount].find(
    (verdict): verdict is Extract<Verdict, { allowed: false }> => !verdict.allowed,
  );

  if (blocked) {
    return { message: `Too many sign-in attempts. ${retryMessage(blocked)}`, values };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

  // One message for every failure. Never "no such account" or "wrong password",
  // because either one confirms whether an address is registered.
  if (!user || !user.passwordHash || !passwordMatches) {
    await hit(SIGN_IN_FAILURES_PER_ACCOUNT, email);
    return { message: "Email or password is incorrect.", values };
  }

  // The right password ends the streak of failures for this account.
  await clear(SIGN_IN_FAILURES_PER_ACCOUNT, email);

  const token = await createSessionToken({ userId: user.id });
  await setSessionCookie(token);

  // Outside any try/catch. redirect() works by throwing a special error that
  // Next catches itself, so swallowing it would break the redirect.
  redirect(safeRedirectPath(formData.get("next")));
}
