"use client";

import { useActionState } from "react";
import { resendConfirmation, type ResendState } from "@/lib/confirmation/actions";

/** Shown until the address is confirmed, because reminder mails wait for it. */
export function ConfirmationNotice({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResendState, FormData>(resendConfirmation, {});

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p>
        Please confirm <span className="font-medium">{email}</span>. Until then no reminder mails go
        there. The link is in the mail sent when you signed up.
      </p>
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="font-medium underline disabled:opacity-50"
        >
          Send the link again
        </button>
      </form>
      {state.message ? <p role="status">{state.message}</p> : null}
    </div>
  );
}
