"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FieldError } from "../field-error";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = {};

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.message && (
        <p
          className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
          role="alert"
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <FieldError messages={state.errors?.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <FieldError messages={state.errors?.password} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>

      {/* After the button, so the tab key goes from the password straight to it. */}
      <Link
        href="/forgot-password"
        className="self-start text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
