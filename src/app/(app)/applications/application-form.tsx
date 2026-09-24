"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Status } from "@/generated/prisma/enums";
import type { ApplicationFormState } from "@/lib/applications/actions";

/**
 * One form for creating and for editing. Two near-identical copies are the
 * surest way to forget one of them when a field is added later.
 *
 * The `action` comes in as a prop, already bound to an id in the edit case.
 * Binding happens on the server, so the id travels signed rather than as a
 * hidden input the browser could change.
 */

const initialState: ApplicationFormState = {};

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPLIED", label: "Applied" },
  { value: "SCREENING", label: "Screening" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "OFFER", label: "Offer" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DECLINED", label: "Declined" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const SOURCE_OPTIONS = [
  { value: "JOB_BOARD", label: "Job board" },
  { value: "REFERRAL", label: "Referral" },
  { value: "DIRECT", label: "Direct" },
  { value: "RECRUITER", label: "Recruiter" },
];

const inputClass =
  "rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-transparent dark:focus:border-zinc-100";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">
      {messages[0]}
    </p>
  );
}

export type ApplicationFormValues = {
  companyName: string;
  role: string;
  status: string;
  source: string;
  salaryMin: string;
  salaryMax: string;
  postingUrl: string;
  notes: string;
  appliedAt: string;
  followUpAt: string;
};

type Props = {
  action: (state: ApplicationFormState, formData: FormData) => Promise<ApplicationFormState>;
  defaultValues: ApplicationFormValues;
  submitLabel: string;
  cancelHref: string;
  /**
   * Which statuses this application can actually move to. Undefined while
   * creating, where every status is a valid starting point.
   */
  allowedStatuses?: readonly Status[];
};

export function ApplicationForm({
  action,
  defaultValues,
  submitLabel,
  cancelHref,
  allowedStatuses,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Narrowing the dropdown is a courtesy, not a guard. The server checks the
  // same rule again, because a form post can carry anything.
  const statusOptions = allowedStatuses
    ? STATUS_OPTIONS.filter(
        (option) =>
          option.value === defaultValues.status || allowedStatuses.includes(option.value as Status),
      )
    : STATUS_OPTIONS;

  // What came back from a failed submit wins over the stored record, so a
  // rejected form shows what the user typed and not what is in the database.
  const value = (field: keyof ApplicationFormValues) =>
    state.values?.[field] ?? defaultValues[field];

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="companyName" className="text-sm font-medium">
            Company
          </label>
          <input
            id="companyName"
            name="companyName"
            required
            defaultValue={value("companyName")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.companyName} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">
            Role
          </label>
          <input
            id="role"
            name="role"
            required
            defaultValue={value("role")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.role} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={value("status")} className={inputClass}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.status} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="source" className="text-sm font-medium">
            Source
          </label>
          <select id="source" name="source" defaultValue={value("source")} className={inputClass}>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.source} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="salaryMin" className="text-sm font-medium">
            Salary from <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="salaryMin"
            name="salaryMin"
            inputMode="numeric"
            defaultValue={value("salaryMin")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.salaryMin} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="salaryMax" className="text-sm font-medium">
            Salary to <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="salaryMax"
            name="salaryMax"
            inputMode="numeric"
            defaultValue={value("salaryMax")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.salaryMax} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="appliedAt" className="text-sm font-medium">
            Applied on <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="appliedAt"
            name="appliedAt"
            type="date"
            defaultValue={value("appliedAt")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.appliedAt} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="followUpAt" className="text-sm font-medium">
            Follow up on <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="followUpAt"
            name="followUpAt"
            type="date"
            defaultValue={value("followUpAt")}
            className={inputClass}
          />
          <FieldError messages={state.errors?.followUpAt} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="postingUrl" className="text-sm font-medium">
          Link to the posting <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="postingUrl"
          name="postingUrl"
          defaultValue={value("postingUrl")}
          className={inputClass}
        />
        <FieldError messages={state.errors?.postingUrl} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={value("notes")}
          className={inputClass}
        />
        <FieldError messages={state.errors?.notes} />
      </div>

      {state.message && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Saving..." : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm text-zinc-600 dark:text-zinc-400">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Empty form, used when creating. */
export const EMPTY_APPLICATION: ApplicationFormValues = {
  companyName: "",
  role: "",
  status: "DRAFT",
  source: "DIRECT",
  salaryMin: "",
  salaryMax: "",
  postingUrl: "",
  notes: "",
  appliedAt: "",
  followUpAt: "",
};
