import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ApplicationForm, type ApplicationFormValues } from "../../application-form";
import { updateApplication } from "@/lib/applications/actions";
import { findApplication } from "@/lib/applications/queries";
import { getSession } from "@/lib/auth/cookies";

export const metadata: Metadata = {
  title: "Edit application",
};

/** <input type="date"> wants exactly YYYY-MM-DD, nothing else. */
function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditApplicationPage({
  params,
}: PageProps<"/applications/[id]/edit">) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const application = await findApplication(session.userId, id);

  if (!application) {
    notFound();
  }

  const defaultValues: ApplicationFormValues = {
    companyName: application.company.name,
    role: application.role,
    status: application.status,
    source: application.source,
    salaryMin: application.salaryMin?.toString() ?? "",
    salaryMax: application.salaryMax?.toString() ?? "",
    postingUrl: application.postingUrl ?? "",
    notes: application.notes ?? "",
    appliedAt: toDateInput(application.appliedAt),
    followUpAt: toDateInput(application.followUpAt),
  };

  // Binding happens here, on the server. The id is part of the action rather
  // than a hidden field, so it never passes through the browser as plain text.
  const action = updateApplication.bind(null, application.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit application</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {application.role} at {application.company.name}
        </p>
      </div>
      <ApplicationForm
        action={action}
        defaultValues={defaultValues}
        submitLabel="Save changes"
        cancelHref={`/applications/${application.id}`}
      />
    </main>
  );
}
