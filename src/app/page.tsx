import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Job Application Tracker</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Track every application, its status, and follow-up reminders, so nothing slips through.
      </p>

      <div className="flex gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Create an account
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium dark:border-zinc-700"
        >
          Sign in
        </Link>
      </div>

      <p className="text-sm text-zinc-500">
        Milestone 02, credentials auth. Applications themselves arrive in M04.
      </p>
    </main>
  );
}
