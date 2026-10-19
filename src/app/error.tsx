"use client";

import { useEffect } from "react";

/**
 * Shown when a page throws while rendering, most likely because the database
 * cannot be reached. Error boundaries have to be Client Components.
 *
 * The visitor never sees the error itself, it can carry internals such as
 * table names. In production Next already swaps the message of a server
 * error for a digest, and the digest is all this page shows, so it can be
 * matched with the server log.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium text-zinc-500">Something went wrong</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page could not be loaded</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        It is usually temporary. When running this locally, check that the database container is up,
        then try again.
      </p>
      {error.digest && <p className="text-xs text-zinc-500">Reference {error.digest}</p>}
      {/* retry() fetches the data again and renders the page anew. reset()
          would only re-render, which cannot help when the data was the problem. */}
      <button
        type="button"
        onClick={() => retry()}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Try again
      </button>
    </main>
  );
}
