"use client";

import { useActionState, useState } from "react";
import { ApplicationForm, EMPTY_APPLICATION, inputClass } from "../application-form";
import { createApplication } from "@/lib/applications/actions";
import { suggestFromPosting, type PostingResult } from "@/lib/posting/actions";
import { afterRead } from "@/lib/posting/form-state";

/**
 * The form for a new application, with a box above it that can fill it in
 * from the text of a job posting.
 *
 * The box only ever suggests. What a model read out of a posting lands in the
 * fields of the form, where it can be checked and changed, and nothing is
 * saved before the form itself is submitted. That goes through the same
 * action and the same validation as a form filled in by hand.
 */

/** "company, role and notes" */
const listFormat = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

type Props = {
  /**
   * What the box says about where the pasted text goes. Null when no model is
   * set up, and then there is no box at all.
   */
  readerNote: string | null;
};

export function NewApplication({ readerNote }: Props) {
  const [posting, setPosting] = useState("");

  // What is held between reads lives here in the browser, see afterRead.
  const [read, readAction, reading] = useActionState<PostingResult, FormData>(
    async (previous, formData) => afterRead(previous, await suggestFromPosting(formData)),
    {},
  );

  const suggestion = read.suggestion;

  return (
    <div className="flex flex-col gap-8">
      {readerNote !== null && (
        <form
          action={readAction}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="posting" className="text-sm font-medium">
              Start from a job posting <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Paste the text of the posting and the form below is filled in for you to check. This
              replaces what is in the form, and nothing is saved until you save the application.
            </p>
          </div>

          {/* Controlled, so the text is still there after the read. React
              empties every other kind of field once a form action is done. */}
          <textarea
            id="posting"
            name="posting"
            rows={6}
            value={posting}
            onChange={(event) => setPosting(event.target.value)}
            className={inputClass}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={reading || posting.trim() === ""}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
            >
              {reading ? "Reading..." : "Read the posting"}
            </button>
            <p className="text-sm text-zinc-500">{readerNote}</p>
          </div>

          {read.message ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {read.message}
            </p>
          ) : suggestion ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
              Filled in {listFormat.format(suggestion.filled)}. Check it before you save.
            </p>
          ) : null}
        </form>
      )}

      {/* The inputs of the form keep their own state, so new values only reach
          them through a new form. The key changes with every suggestion. */}
      <ApplicationForm
        key={suggestion?.id ?? "empty"}
        action={createApplication}
        defaultValues={
          suggestion ? { ...EMPTY_APPLICATION, ...suggestion.fields } : EMPTY_APPLICATION
        }
        submitLabel="Save application"
        cancelHref="/applications"
      />
    </div>
  );
}
