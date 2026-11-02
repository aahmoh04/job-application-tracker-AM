import type { Metadata } from "next";
import Link from "next/link";
import { countApplications, countDueFollowUps } from "@/lib/applications/queries";
import { requireUser } from "@/lib/auth/guard";
import { ConfirmationNotice } from "./confirmation-notice";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  // The layout already turned anonymous visitors away, and the proxy before
  // that. This check is here anyway, because a guard that lives in only one
  // place is one configuration mistake away from being gone. CVE-2025-29927
  // was exactly that: a header that made Next skip middleware entirely.
  const user = await requireUser();
  const { confirmed } = await searchParams;

  const [applicationCount, openFollowUps] = await Promise.all([
    countApplications(user.id),
    countDueFollowUps(user.id, new Date()),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
      </div>

      {user.emailVerifiedAt === null ? <ConfirmationNotice email={user.email} /> : null}
      {confirmed === "1" && user.emailVerifiedAt !== null ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Your address is confirmed. Reminder mails can reach you now.
        </p>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <dt className="text-sm text-zinc-500">Applications</dt>
          <dd className="text-2xl font-semibold">{applicationCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <dt className="text-sm text-zinc-500">Follow-ups due</dt>
          <dd className="text-2xl font-semibold">{openFollowUps}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <dt className="text-sm text-zinc-500">Role</dt>
          <dd className="text-2xl font-semibold">{user.role}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/applications"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          View applications
        </Link>
        <Link
          href="/applications/new"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Add application
        </Link>
        <Link
          href="/applications/board"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Open board
        </Link>
        <Link
          href="/analytics"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Open analytics
        </Link>
      </div>
    </main>
  );
}
