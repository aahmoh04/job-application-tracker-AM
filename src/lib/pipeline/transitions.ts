import { Status } from "@/generated/prisma/enums";

/**
 * The pipeline as a state machine.
 *
 * Until now the status dropdown accepted anything, so a DRAFT could jump
 * straight to ACCEPTED. That is not a feature anyone asked for, it is a bug
 * waiting for a stale browser tab or a mis-click. These rules turn "which
 * moves make sense" from something you have to remember into something the
 * code knows.
 */

/**
 * `satisfies` rather than a plain type annotation. It checks that every status
 * has an entry and that every target is a real status, and it still keeps the
 * literal values, so the types below can read the actual lists.
 *
 * Add a status to the enum without adding it here and the build fails.
 */
export const TRANSITIONS = {
  DRAFT: ["APPLIED", "WITHDRAWN"],
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN"],
  OFFER: ["ACCEPTED", "DECLINED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  DECLINED: [],
  WITHDRAWN: [],
} as const satisfies Record<Status, readonly Status[]>;

/** The statuses reachable from a given one, at type level. */
export type NextStatus<From extends Status> = (typeof TRANSITIONS)[From][number];

/** Nothing leads out of these. The application has reached its end. */
export function isTerminal(status: Status): boolean {
  return TRANSITIONS[status].length === 0;
}

export function nextStatuses(from: Status): readonly Status[] {
  return TRANSITIONS[from];
}

/**
 * The runtime check, and the one that matters for anything arriving from a
 * form. The types above catch a wrong literal while writing code, but a status
 * posted by a browser is just a string until this function has looked at it.
 */
export function canTransition(from: Status, to: Status): boolean {
  if (from === to) {
    // Saving a form without touching the status is not a transition and must
    // not be rejected as one.
    return true;
  }

  return (TRANSITIONS[from] as readonly Status[]).includes(to);
}

/** Wording for the buttons that offer a move, rather than a bare status name. */
export const TRANSITION_LABELS: Record<Status, string> = {
  DRAFT: "Back to draft",
  APPLIED: "Mark as applied",
  SCREENING: "Moved to screening",
  INTERVIEW: "Got an interview",
  OFFER: "Received an offer",
  ACCEPTED: "Accepted the offer",
  REJECTED: "Got rejected",
  DECLINED: "Declined the offer",
  WITHDRAWN: "Withdraw",
};
