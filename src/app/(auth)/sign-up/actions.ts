"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { setSessionCookie } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { signUpSchema } from "@/lib/validation/auth";

export type SignUpState = {
  errors?: {
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
};

export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  // Never trust the client. The browser ran the same schema, but nothing stops
  // anyone from posting straight to this endpoint with whatever they like.
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;

  // Hash before touching the database, deliberately. Doing it the other way
  // round would make the response measurably faster for an email that is
  // already taken, which is a timing side channel.
  const passwordHash = await hashPassword(password);

  let user;

  try {
    user = await prisma.user.create({ data: { email, passwordHash } });
  } catch (error) {
    // P2002 is Prisma's code for a unique constraint violation. Here that can
    // only be the email, since it is the single unique column on User.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: { email: ["An account with this email already exists."] } };
    }
    throw error;
  }

  const token = await createSessionToken({ userId: user.id, role: user.role });
  await setSessionCookie(token);

  // Outside the try/catch above. redirect() works by throwing a special error
  // that Next catches itself, so a catch block would swallow the redirect.
  redirect("/dashboard");
}
