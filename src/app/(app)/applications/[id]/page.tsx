import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteApplicationButton } from "@/components/delete-application-button";
import { StatusBadge } from "@/components/status-badge";
import { advanceStatus, deleteApplication } from "@/lib/applications/actions";
import { findApplication } from "@/lib/applications/queries";
import { getSession } from "@/lib/auth/cookies";
import { isTerminal, nextStatuses, TRANSITION_LABELS } from "@/lib/pipeline/transitions";
import type { Status } from "@/generated/prisma/enums";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Purely about looks. Ending an application badly should not be the button your
// thumb lands on by accident, so those get the quiet treatment.
const QUIET_STATUSES: readonly Status[] = ["DRAFT", "REJECTED", "DECLINED", "WITHDRAWN"];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/applications/[id]">) {
  const session = await getSession();

  if (!session) return { title: "Application" };

  const { id } = await params;
  const application = await findApplication(session.userId, id);

  return {
    title: application ? `${application.role} at ${application.company.name}` : "Application",
  };
}

export default async function ApplicationDetailPage({ params }: PageProps<"/applications/[id]">) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;

  // Returns null both when the id does not exist and when it belongs to
  // someone else. Answering 404 in both cases is deliberate: a different
  // answer would confirm that the id exists, which is information the caller
  // has no business having.
  const application = await findApplication(session.userId, id);

  if (!application) {
    notFound();
  }

  const salary =
    application.salaryMin || application.salaryMax
      ? [application.salaryMin, application.salaryMax]
          .filter((value): value is number => value !== null)
          .map((value) => currencyFormat.format(value))
          .join(" to ")
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-3">
        <Link href="/applications" className="text-sm text-zinc-600 dark:text-zinc-400">
          ← All applications
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{application.role}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">{application.company.name}</p>
          </div>
          <StatusBadge status={application.status} />
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={`/applications/${application.id}/edit`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Edit
          </Link>
          <DeleteApplicationButton action={deleteApplication.bind(null, application.id)} />
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Where does this go next?</h2>
        {isTerminal(application.status) ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This one is closed. Nothing follows {application.status.toLowerCase()}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextStatuses(application.status).map((status) => (
              // One form per button, because each carries a different target.
              // The status is bound on the server, so the browser never gets to
              // say where this application is allowed to end up.
              <form key={status} action={advanceStatus.bind(null, application.id, status)}>
                <button
                  type="submit"
                  className={
                    QUIET_STATUSES.includes(status)
                      ? "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                      : "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  }
                >
                  {TRANSITION_LABELS[status]}
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      <dl className="grid gap-5 rounded-lg border border-zinc-200 p-5 sm:grid-cols-2 dark:border-zinc-800">
        <Detail label="Source">{application.source.replace("_", " ").toLowerCase()}</Detail>
        <Detail label="Salary">{salary ?? "—"}</Detail>
        <Detail label="Applied on">
          {application.appliedAt ? dateFormat.format(application.appliedAt) : "—"}
        </Detail>
        <Detail label="Follow up on">
          {application.followUpAt ? dateFormat.format(application.followUpAt) : "—"}
        </Detail>
        <Detail label="Posting">
          {application.postingUrl ? (
            <a
              href={application.postingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Open
            </a>
          ) : (
            "—"
          )}
        </Detail>
      </dl>

      {application.notes && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
            {application.notes}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Timeline</h2>
        <ol className="flex flex-col gap-3">
          {application.statusEvents.map((event) => (
            <li key={event.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-zinc-500">
                {dateTimeFormat.format(event.createdAt)}
              </span>
              <span>
                {event.from ? `${event.from} → ${event.to}` : event.to}
                {event.note && <span className="text-zinc-500"> · {event.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
