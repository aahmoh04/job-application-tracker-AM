"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createApplication, type ApplicationFormState } from "@/lib/applications/actions";

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

export function ApplicationForm() {
  const [state, formAction, isPending] = useActionState(createApplication, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="companyName" className="text-sm font-medium">
            Company
          </label>
          <input id="companyName" name="companyName" required className={inputClass} />
          <FieldError messages={state.errors?.companyName} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">
            Role
          </label>
          <input id="role" name="role" required className={inputClass} />
          <FieldError messages={state.errors?.role} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue="DRAFT" className={inputClass}>
            {STATUS_OPTIONS.map((option) => (
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
          <select id="source" name="source" defaultValue="DIRECT" className={inputClass}>
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
          <input id="salaryMin" name="salaryMin" inputMode="numeric" className={inputClass} />
          <FieldError messages={state.errors?.salaryMin} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="salaryMax" className="text-sm font-medium">
            Salary to <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="salaryMax" name="salaryMax" inputMode="numeric" className={inputClass} />
          <FieldError messages={state.errors?.salaryMax} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="appliedAt" className="text-sm font-medium">
            Applied on <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="appliedAt" name="appliedAt" type="date" className={inputClass} />
          <FieldError messages={state.errors?.appliedAt} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="followUpAt" className="text-sm font-medium">
            Follow up on <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="followUpAt" name="followUpAt" type="date" className={inputClass} />
          <FieldError messages={state.errors?.followUpAt} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="postingUrl" className="text-sm font-medium">
          Link to the posting <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input id="postingUrl" name="postingUrl" className={inputClass} />
        <FieldError messages={state.errors?.postingUrl} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea id="notes" name="notes" rows={4} className={inputClass} />
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
          {isPending ? "Saving…" : "Save application"}
        </button>
        <Link href="/applications" className="text-sm text-zinc-600 dark:text-zinc-400">
          Cancel
        </Link>
      </div>
    </form>
  );
}
