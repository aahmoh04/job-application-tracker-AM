import type { Metadata } from "next";
import { ApplicationForm, EMPTY_APPLICATION } from "../application-form";
import { createApplication } from "@/lib/applications/actions";

export const metadata: Metadata = {
  title: "Add application",
};

export default function NewApplicationPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add application</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Company and role are enough to start. Everything else can follow later.
        </p>
      </div>
      <ApplicationForm
        action={createApplication}
        defaultValues={EMPTY_APPLICATION}
        submitLabel="Save application"
        cancelHref="/applications"
      />
    </main>
  );
}
