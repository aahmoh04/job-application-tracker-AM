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
  /**
   * What the user typed, sent back on failure so the form can put it back into
   * the fields. Without this every validation error clears the whole form,
   * which is the fastest way to make someone give up on a long form.
   */
  values?: Record<string, string>;
};

/**
 * Every action checks the session itself. The proxy keeps anonymous visitors
 * off the pages, and the layout checks again, but a Server Action is its own
 * endpoint and can be called without ever loading a page.
 */
async function requireUserId(): Promise<string> {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session.userId;
}

/** Search for the company, create it if new. One statement, so two requests
 * arriving at once cannot both try to create it and one hit the unique name. */
function upsertCompany(name: string) {
  return prisma.company.upsert({
    where: { name },
    update: {},
    create: { name },
    select: { id: true },
  });
}

export async function createApplication(
  _prevState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const userId = await requireUserId();
  const raw = applicationFormData(formData);
  const parsed = applicationSchema.safeParse(raw);

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: raw };
  }

  const { companyName, status, ...fields } = parsed.data;
  const company = await upsertCompany(companyName);

  const application = await prisma.application.create({
    data: {
      ...fields,
      status,
      userId,
      companyId: company.id,
      // First entry in the history. `from` is null because there is no
      // previous status, which is why the column is nullable.
      statusEvents: { create: { from: null, to: status, note: "Application created" } },
    },
    select: { id: true },
  });

  revalidatePath("/applications");
  redirect(`/applications/${application.id}`);
}

export async function updateApplication(
  id: string,
  _prevState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const userId = await requireUserId();

  // Load with the user id in the where clause, exactly like every read. If the
  // row belongs to someone else it is not found, and nothing below runs.
  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true, status: true },
  });

  if (!existing) {
    // Same answer as a row that does not exist. Anything else would confirm
    // that this id is real.
    redirect("/applications");
  }

  const raw = applicationFormData(formData);
  const parsed = applicationSchema.safeParse(raw);

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: raw };
  }

  const { companyName, status, ...fields } = parsed.data;
  const company = await upsertCompany(companyName);
  const statusChanged = status !== existing.status;

  // Both writes in one transaction. A status change that is saved without its
  // history entry would leave a timeline that quietly lies.
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: existing.id },
      data: { ...fields, status, companyId: company.id },
    });

    if (statusChanged) {
      await tx.statusEvent.create({
        data: { applicationId: existing.id, from: existing.status, to: status },
      });
    }
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${existing.id}`);
  redirect(`/applications/${existing.id}`);
}

export async function deleteApplication(id: string): Promise<void> {
  const userId = await requireUserId();

  // deleteMany rather than delete, because it takes a full where clause and
  // simply affects zero rows when the id belongs to someone else. `delete`
  // only accepts a unique field and would throw on a foreign id, which means
  // writing the ownership check separately and being able to forget it.
  await prisma.application.deleteMany({ where: { id, userId } });

  revalidatePath("/applications");
  redirect("/applications");
}
