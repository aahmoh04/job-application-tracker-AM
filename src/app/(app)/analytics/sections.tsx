import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { Source, Status } from "@/generated/prisma/enums";
import {
  QUIET_AFTER_DAYS,
  WEEKS_SHOWN,
  type Funnel,
  type QuietApplication,
  type SourceResponse,
  type StageDuration,
  type WeekBucket,
} from "@/lib/analytics/queries";

/**
 * The building blocks of the analytics page. Plain HTML and CSS, no chart
 * library. Each chart answers one question, uses as few colours as it can and
 * prints its numbers as text, so nothing depends on telling shades apart.
 */

const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

// Weeks start on a Monday at midnight UTC, the same as the query groups them.
const weekLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const SOURCE_LABELS: Record<Source, string> = {
  JOB_BOARD: "Job board",
  REFERRAL: "Referral",
  DIRECT: "Direct",
  RECRUITER: "Recruiter",
};

function days(value: number): string {
  return `${decimal.format(value)} ${value === 1 ? "day" : "days"}`;
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

/** Same colours as the status badges, grouped into four outcomes. */
const OUTCOMES = [
  { key: "open", label: "Still open", colour: "bg-blue-500" },
  { key: "accepted", label: "Accepted", colour: "bg-emerald-500" },
  { key: "rejected", label: "Rejected", colour: "bg-red-500" },
  { key: "endedByMe", label: "Withdrawn or declined", colour: "bg-zinc-400 dark:bg-zinc-500" },
] as const;

const BAR_HEIGHT_PX = 160;

export function WeeklyChart({ weeks }: { weeks: WeekBucket[] }) {
  const totals = weeks.map((week) => OUTCOMES.reduce((sum, outcome) => sum + week[outcome.key], 0));
  const highest = Math.max(...totals);

  if (highest === 0) {
    return <Empty>No application with a date in the last {WEEKS_SHOWN} weeks.</Empty>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {OUTCOMES.map((outcome) => (
          <li key={outcome.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${outcome.colour}`} aria-hidden="true" />
            {outcome.label}
          </li>
        ))}
      </ul>

      <ol className="grid grid-cols-12 items-end gap-1.5 sm:gap-2">
        {weeks.map((week, index) => {
          const total = totals[index];
          const label = weekLabel.format(new Date(`${week.week}T00:00:00Z`));
          const parts = OUTCOMES.filter((outcome) => week[outcome.key] > 0)
            .map((outcome) => `${week[outcome.key]} ${outcome.label.toLowerCase()}`)
            .join(", ");

          return (
            <li
              key={week.week}
              className="flex flex-col items-center gap-1"
              aria-label={`Week of ${label}, ${total} sent${parts ? `, ${parts}` : ""}`}
            >
              <span className="text-xs text-zinc-500 tabular-nums" aria-hidden="true">
                {total > 0 ? total : ""}
              </span>
              {/* The bar grows with the week's total. Inside it, flex-grow shares
                  the height between the outcomes in proportion to their counts. */}
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                style={{ height: total > 0 ? Math.max(4, (total / highest) * BAR_HEIGHT_PX) : 0 }}
              >
                {OUTCOMES.map((outcome) =>
                  week[outcome.key] > 0 ? (
                    <div
                      key={outcome.key}
                      className={outcome.colour}
                      style={{ flexGrow: week[outcome.key], flexBasis: 0 }}
                    />
                  ) : null,
                )}
              </div>
              <span
                className={`text-[11px] whitespace-nowrap text-zinc-500 ${index % 2 === 1 ? "hidden sm:block" : ""}`}
                aria-hidden="true"
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const FUNNEL_STEPS = [
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
] as const;

export function FunnelChart({ funnel }: { funnel: Funnel }) {
  if (funnel.applied === 0) {
    return <Empty>Nothing has been sent yet.</Empty>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {FUNNEL_STEPS.map((step) => {
        const count = funnel[step.key];
        const share = count / funnel.applied;

        return (
          <li
            key={step.key}
            className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm"
          >
            <span>{step.label}</span>
            <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${share * 100}%` }}
              />
            </div>
            <span className="text-right text-zinc-600 tabular-nums dark:text-zinc-400">
              {count} ({percent.format(share)})
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SourceTable({ rows }: { rows: SourceResponse[] }) {
  if (rows.length === 0) {
    return <Empty>Nothing has been sent yet.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="pb-2 font-normal">Source</th>
            <th className="pb-2 text-right font-normal">Sent</th>
            <th className="pb-2 text-right font-normal">Answered</th>
            <th className="pb-2 text-right font-normal">Answer rate</th>
            <th className="pb-2 text-right font-normal">Median days to an answer</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => (
            <tr key={row.source} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-2">{SOURCE_LABELS[row.source]}</td>
              <td className="py-2 text-right">{row.applied}</td>
              <td className="py-2 text-right">{row.responded}</td>
              <td className="py-2 text-right">{percent.format(row.responded / row.applied)}</td>
              <td className="py-2 text-right">
                {row.medianDaysToResponse === null
                  ? "No answer yet"
                  : decimal.format(row.medianDaysToResponse)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The stages an application can sit in. Final statuses have no stay to measure. */
const STAGES: readonly Status[] = ["DRAFT", "APPLIED", "SCREENING", "INTERVIEW", "OFFER"];

export function StageDurations({ rows }: { rows: StageDuration[] }) {
  if (rows.length === 0) {
    return <Empty>No application has moved on from a stage yet.</Empty>;
  }

  const byStage = new Map(rows.map((row) => [row.stage, row]));
  const longest = Math.max(...rows.map((row) => row.averageDays), 1);

  return (
    <ol className="flex flex-col gap-3">
      {STAGES.map((stage) => {
        const row = byStage.get(stage);

        return (
          <li key={stage} className="grid grid-cols-[6.5rem_1fr_7.5rem] items-center gap-3 text-sm">
            <span>
              <StatusBadge status={stage} />
            </span>
            <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-900">
              {row && (
                <div
                  className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
                  style={{ width: `${(row.averageDays / longest) * 100}%` }}
                />
              )}
            </div>
            <span className="text-right text-zinc-600 tabular-nums dark:text-zinc-400">
              {row ? (
                <>
                  {days(row.averageDays)}
                  <span className="block text-xs text-zinc-500">
                    from {row.stays} {row.stays === 1 ? "stay" : "stays"}
                  </span>
                </>
              ) : (
                "No finished stay"
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function QuietList({ rows }: { rows: QuietApplication[] }) {
  if (rows.length === 0) {
    return <Empty>Nothing has been waiting for news longer than {QUIET_AFTER_DAYS} days.</Empty>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/applications/${row.id}`}
            className="flex items-center gap-4 rounded-md border border-zinc-200 px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{row.role}</span>
              <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                {row.company}
              </span>
            </span>
            <StatusBadge status={row.status} />
            <span className="w-28 shrink-0 text-right text-sm text-zinc-500 tabular-nums">
              {Math.floor(row.daysQuiet)} days quiet
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
