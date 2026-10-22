"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SIGN_UPS_PER_ADDRESS, hit, retryMessage } from "@/lib/rate-limit";
import { clientAddress } from "@/lib/request";
import { signUpSchema } from "@/lib/validation/auth";

export type SignUpState = {
  errors?: {
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  message?: string;
  /** The email as typed, so a failed attempt does not empty the field. Never the passwords. */
  values?: { email: string };
};

export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = { email: (formData.get("email") ?? "").toString() };

  // The only check there is. The form switches off the browser's own
  // validation with noValidate, and nothing stops anyone from posting straight
  // to this endpoint with whatever they like.
  const parsed = signUpSchema.safeParse({
    email: values.email,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const { email, password } = parsed.data;

  // Counted once the input is valid, before the expensive hash and before
  // anything is written. A taken address counts too, otherwise sign-up would
  // let anyone test as fast as they like which addresses are registered.
  const verdict = await hit(SIGN_UPS_PER_ADDRESS, await clientAddress());

  if (!verdict.allowed) {
    return { message: `Too many new accounts from here. ${retryMessage(verdict)}`, values };
  }

  // Hash before touching the database, so a taken address does not answer
  // measurably faster. Right now that protects nothing, because the error
  // below says openly that the address is taken. It starts to matter once
  // sign-up confirms addresses by mail and can stop saying so.
  const passwordHash = await hashPassword(password);

  let user;

  try {
    user = await prisma.user.create({ data: { email, passwordHash } });
  } catch (error) {
    // P2002 is Prisma's code for a unique constraint violation. Here that can
    // only be the email, since it is the single unique column on User.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: { email: ["An account with this email already exists."] }, values };
    }
    throw error;
  }

  const token = await createSessionToken({ userId: user.id });
  await setSessionCookie(token);

  // Outside the try/catch above. redirect() works by throwing a special error
  // that Next catches itself, so a catch block would swallow the redirect.
  redirect("/dashboard");
}
