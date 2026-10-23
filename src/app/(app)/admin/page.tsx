import type { Metadata } from "next";
import { StatusBadge } from "@/components/status-badge";
import { ACTIVE_WITHIN_DAYS, JOINED_WITHIN_DAYS, platformNumbers } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/guard";

export const metadata: Metadata = {
  title: "Admin",
};

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}

export default async function AdminPage() {
  // Anyone who is not an admin right now gets a 404, signed in or not.
  await requireAdmin();

  const { accounts, applications } = await platformNumbers(new Date());

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          How the platform is used, in counts only. This page shows no application, email or company
          name of any account.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Tile label="Accounts" value={accounts.total} />
          <Tile
            label={`Joined in the last ${JOINED_WITHIN_DAYS} days`}
            value={accounts.joinedRecently}
          />
          <Tile label={`Active in the last ${ACTIVE_WITHIN_DAYS} days`} value={accounts.active} />
          <Tile label="Sign in with a password" value={accounts.withPassword} />
          <Tile label="Sign in with GitHub only" value={accounts.total - accounts.withPassword} />
          <Tile label="Admins" value={accounts.admins} />
        </dl>
        <p className="text-sm text-zinc-500">
          Active means the account added or moved an application.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Applications</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {applications.total} tracked across all accounts, by where they stand now.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {applications.byStatus.map(({ status, count }) => (
            <li
              key={status}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <StatusBadge status={status} />
              <span className="font-semibold tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
