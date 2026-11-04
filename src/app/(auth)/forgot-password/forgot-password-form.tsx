"use client";

import { useActionState } from "react";
import { requestPasswordReset, type RequestResetState } from "@/lib/password-reset/actions";
import { FieldError } from "../field-error";

const initialState: RequestResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);

  // The same words for every address. Whether an account has it only shows
  // in that inbox.
  if (state.sentTo) {
    return (
      <p
        role="status"
        className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      >
        If an account belongs to <span className="font-medium">{state.sentTo}</span>, a link to
        choose a new password is on its way. It works for one hour. Nothing there after a few
        minutes? Have a look in the spam folder.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
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

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Sending..." : "Send the link"}
      </button>
    </form>
  );
}
