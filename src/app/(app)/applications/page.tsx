import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { listApplications } from "@/lib/applications/queries";
import { getSession } from "@/lib/auth/cookies";

export const metadata: Metadata = {
  title: "Applications",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function ApplicationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  // The user id goes into the query, not into a check afterwards.
  const applications = await listApplications(session.userId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {applications.length === 0 ? "Nothing here yet." : `${applications.length} tracked.`}
          </p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add application
        </Link>
      </div>

      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <p className="font-medium">No applications yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add the first one and it will show up here with its status and timeline.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/applications/${application.id}`}
                className="flex items-center gap-4 rounded-lg border border-zinc-200 px-4 py-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{application.role}</span>
                  <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {application.company.name}
                  </span>
                </div>

                {application.followUpAt && application.followUpAt < new Date() && (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    Follow-up due
                  </span>
                )}

                <StatusBadge status={application.status} />

                <span className="w-24 shrink-0 text-right text-sm text-zinc-500">
                  {application.appliedAt ? dateFormat.format(application.appliedAt) : "Not set"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
