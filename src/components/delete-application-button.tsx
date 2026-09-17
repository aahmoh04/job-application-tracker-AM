"use client";

import { useState } from "react";

/**
 * Two clicks instead of a browser confirm dialog. A native confirm() blocks the
 * whole page and looks like a system error, and deleting on the first click is
 * the kind of thing people only forgive once.
 */
export function DeleteApplicationButton({ action }: { action: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-sm text-red-600 dark:text-red-400"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">Delete for good?</span>
      <form action={action}>
        <button type="submit" className="font-medium text-red-600 dark:text-red-400">
          Yes, delete
        </button>
      </form>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-zinc-600 dark:text-zinc-400"
      >
        Keep it
      </button>
    </span>
  );
}
