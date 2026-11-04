import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot your password",
};

// Open with or without a session. Someone who is still signed in on one
// device and has forgotten the password should be able to choose a new one.
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Enter the address of your account, and you get a link to choose a new password.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link
        href="/sign-in"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        Back to sign in
      </Link>
    </main>
  );
}
