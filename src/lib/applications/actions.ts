"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { applicationFormData, applicationSchema } from "@/lib/validation/application";

export type ApplicationFormState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
};

export async function createApplication(
  _prevState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  // Every action re-checks the session itself. The proxy keeps anonymous
  // visitors off the pages, but a Server Action is its own endpoint and can be
  // called without ever loading one.
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const parsed = applicationSchema.safeParse(applicationFormData(formData));

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { companyName, status, ...fields } = parsed.data;

  // Find the company or create it. `upsert` does both in one statement, which
  // matters because two requests arriving at once would otherwise race each
  // other and one would hit the unique constraint on the name.
  const company = await prisma.company.upsert({
    where: { name: companyName },
    update: {},
    create: { name: companyName },
    select: { id: true },
  });

  const application = await prisma.application.create({
    data: {
      ...fields,
      status,
      userId: session.userId,
      companyId: company.id,
      // The first entry in the history. `from` is null because there is no
      // previous status, which is why the column is nullable.
      statusEvents: {
        create: { from: null, to: status, note: "Application created" },
      },
    },
    select: { id: true },
  });

  // Tells Next that the cached list is stale, otherwise the new row would not
  // show up until the next full page load.
  revalidatePath("/applications");
  redirect(`/applications/${application.id}`);
}
