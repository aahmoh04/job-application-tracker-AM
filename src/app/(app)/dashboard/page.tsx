import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { countApplications } from "@/lib/applications/queries";
import { getSession } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  // The layout already turned anonymous visitors away, and the proxy before
  // that. This check is here anyway, because a guard that lives in only one
  // place is one configuration mistake away from being gone. CVE-2025-29927
  // was exactly that: a header that made Next skip middleware entirely.
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const [user, applicationCount, openFollowUps] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, role: true },
    }),
    countApplications(session.userId),
    prisma.application.count({
      where: { userId: session.userId, followUpAt: { lt: new Date() } },
    }),
  ]);

  if (!user) {
    // Token is valid but the account is gone. Treat it as signed out.
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
      </div>

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

      <div className="flex items-center gap-3">
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
      </div>

      <p className="text-sm text-zinc-500">
        The status pipeline with drag and drop arrives in M05, charts in M08.
      </p>
    </main>
  );
}
