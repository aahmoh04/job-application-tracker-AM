import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listApplications } from "@/lib/applications/queries";
import { getSession } from "@/lib/auth/cookies";
import { KanbanBoard, type BoardCard } from "./kanban-board";

export const metadata: Metadata = {
  title: "Board",
};

export default async function BoardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const applications = await listApplications(session.userId);
  const now = new Date();

  // Only what a card shows. Props of a Client Component are written into the
  // page as data, so everything handed over here can be read in the browser.
  const cards: BoardCard[] = applications.map((application) => ({
    id: application.id,
    role: application.role,
    company: application.company.name,
    status: application.status,
    followUpDue: application.followUpAt !== null && application.followUpAt < now,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Drag a card to move it along the pipeline. Only the columns it can reach will take it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/applications"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            List
          </Link>
          <Link
            href="/applications/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add application
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <p className="font-medium">Nothing on the board yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add an application and it shows up here in its column.
          </p>
        </div>
      ) : (
        <KanbanBoard cards={cards} />
      )}
    </main>
  );
}
