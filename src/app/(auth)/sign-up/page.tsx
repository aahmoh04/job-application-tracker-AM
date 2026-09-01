import type { Metadata } from "next";
import { OAuthButtons } from "../oauth-buttons";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create an account",
};

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Start tracking your applications in one place.
        </p>
      </div>
      <SignUpForm />
      <OAuthButtons />
    </main>
  );
}
