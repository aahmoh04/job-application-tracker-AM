import type { Status } from "@/generated/prisma/enums";

/**
 * Colour carries meaning here, so it is not the only signal. The label is
 * always spelled out, which keeps it readable for anyone who cannot tell the
 * shades apart.
 */
const STYLES: Record<Status, string> = {
  DRAFT: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  APPLIED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  SCREENING: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  INTERVIEW: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  OFFER: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ACCEPTED: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  REJECTED: "bg-red-500/10 text-red-700 dark:text-red-400",
  DECLINED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  WITHDRAWN: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const LABELS: Record<Status, string> = {
  DRAFT: "Draft",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
