import type { Metadata } from "next";
import Link from "next/link";
import { OAuthButtons } from "../oauth-buttons";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

// Deliberately vague where it matters. "state mismatch" and "incomplete" get
// the same wording, because the difference is only interesting to an attacker.
const OAUTH_ERRORS: Record<string, string> = {
  oauth_cancelled: "Sign-in with GitHub was cancelled.",
  oauth_state_mismatch: "That sign-in attempt expired or did not check out. Please try again.",
  oauth_incomplete: "That sign-in attempt expired or did not check out. Please try again.",
  oauth_exchange_failed: "GitHub did not accept the sign-in. Please try again.",
  oauth_no_verified_email:
    "Your GitHub account has no verified email address. Verify one on GitHub, then try again.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? OAUTH_ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No account yet?{" "}
          <Link href="/sign-up" className="underline underline-offset-4">
            Create one
          </Link>
          .
        </p>
      </div>

      {message && (
        <p
          className="rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
          role="alert"
        >
          {message}
        </p>
      )}

      <SignInForm />
      <OAuthButtons />
    </main>
  );
}
