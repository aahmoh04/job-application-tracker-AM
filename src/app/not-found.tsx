import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
};

/**
 * Shown for any address that leads nowhere, and for an application that
 * belongs to someone else. Both get the same page on purpose, a different
 * answer would confirm that a foreign id exists.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This page does not exist, or it is not yours to see. From here the two look the same.
      </p>
      <Link
        href="/dashboard"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Back to the dashboard
      </Link>
    </main>
  );
}
