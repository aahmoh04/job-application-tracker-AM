import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmailAction } from "@/lib/confirmation/actions";
import { pendingConfirmation } from "@/lib/confirmation/tokens";

export const metadata: Metadata = {
  title: "Confirm your address",
};

/**
 * Where a confirmation link leads. Opening it only shows the address, the
 * button confirms. Mail scanners and link previews open links on their own,
 * and confirming on the first visit would let one of them confirm an address
 * whose owner never clicked anything.
 */
export default async function ConfirmEmailPage({ searchParams }: PageProps<"/confirm-email">) {
  const { token } = await searchParams;
  const candidate = typeof token === "string" ? token : "";
  const pending = candidate ? await pendingConfirmation(candidate) : null;

  if (!pending) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">This link no longer works</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          It has been used already, or it is older than a day. Sign in and ask for a new one on the
          dashboard.
        </p>
        <Link href="/dashboard" className="text-sm font-medium underline">
          Go to the dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Confirm your address</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Confirm that <span className="font-medium">{pending.email}</span> belongs to you. After
          that, JobTracker can send your follow-up reminders there.
        </p>
      </div>
      <form action={confirmEmailAction.bind(null, candidate)}>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Confirm my address
        </button>
      </form>
    </main>
  );
}
