import type { Metadata } from "next";
import Link from "next/link";
import { pendingPasswordReset } from "@/lib/password-reset/tokens";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/**
 * Where a reset link leads. Opening it only shows the form, saving the form
 * changes the password. Mail scanners and link previews open links on their
 * own, so a visit must not change anything, the same rule as for the
 * confirmation link. Open with or without a session, the link is the proof.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const candidate = typeof token === "string" ? token : "";
  const pending = candidate ? await pendingPasswordReset(candidate) : null;

  if (!pending) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">This link no longer works</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          It has been used already, it is older than an hour, or a newer link replaced it.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium underline">
          Ask for a new link
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          For <span className="font-medium">{pending.email}</span>. Saving it signs out every device
          that is signed in to this account, and then you sign in with the new password.
        </p>
      </div>
      <ResetPasswordForm token={candidate} />
    </main>
  );
}
