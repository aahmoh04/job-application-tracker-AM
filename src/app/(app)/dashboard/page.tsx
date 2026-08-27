import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  // The proxy already turns anonymous visitors away. This check is here
  // anyway, because a route guard that lives only at the network boundary is
  // one configuration mistake away from being gone. CVE-2025-29927 was exactly
  // that: a header that made Next skip middleware entirely.
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, role: true, createdAt: true },
  });

  if (!user) {
    // Token is valid but the account is gone. Treat it as signed out.
    redirect("/sign-in");
  }

  const applicationCount = await prisma.application.count({
    where: { userId: session.userId },
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <dt className="text-sm text-zinc-500">Applications</dt>
          <dd className="text-2xl font-semibold">{applicationCount}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <dt className="text-sm text-zinc-500">Role</dt>
          <dd className="text-2xl font-semibold">{user.role}</dd>
        </div>
      </dl>

      <p className="text-sm text-zinc-500">
        Creating and listing applications arrives in M04. For now this page only proves that the
        session works.
      </p>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
