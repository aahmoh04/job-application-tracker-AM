"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
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
};

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);

  // One message for every failure. Never "no such account" or "wrong password",
  // because either one confirms whether an address is registered.
  if (!user || !user.passwordHash || !passwordMatches) {
    return { message: "Email or password is incorrect." };
  }

  const token = await createSessionToken({ userId: user.id, role: user.role });
  await setSessionCookie(token);

  // Outside any try/catch. redirect() works by throwing a special error that
  // Next catches itself, so swallowing it would break the redirect.
  redirect("/dashboard");
}
