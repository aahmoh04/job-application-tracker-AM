"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Status } from "@/generated/prisma/enums";
import { getSession } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { canTransition } from "@/lib/pipeline/transitions";
import {
  applicationFormData,
  applicationIdSchema,
  applicationSchema,
  statusSchema,
} from "@/lib/validation/application";

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

/**
 * Arguments passed in through `bind` look like they come from the server, but
 * they do not stay there. React writes them into the page as a hidden form
 * field, the browser sends them back with the request, and anyone can change
 * them on the way. They are decoded from JSON too, so an id can arrive as an
 * object, and Prisma would read `{ not: "" }` as a filter that matches every
 * application of the user. The parameter types do not stop that, TypeScript
 * is gone by the time a request arrives. So these are parsed like form input.
 */
function parseApplicationId(value: unknown): string | null {
  const parsed = applicationIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
  const applicationId = parseApplicationId(id);

  if (!applicationId) {
    redirect("/applications");
  }

  // Load with the user id in the where clause, exactly like every read. If the
  // row belongs to someone else it is not found, and nothing below runs.
  const existing = await prisma.application.findFirst({
    where: { id: applicationId, userId },
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

  // The dropdown only offers reachable statuses, but a form post is just data
  // and can carry anything. The rule is enforced here, where it cannot be
  // bypassed, and offered in the UI only as a convenience.
  if (!canTransition(existing.status, status)) {
    return {
      errors: { status: [`An application cannot move from ${existing.status} to ${status}.`] },
      values: raw,
    };
  }

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
  const applicationId = parseApplicationId(id);

  // Matters most here. Without the parsing, an id sent as `{ not: "" }` would
  // turn this into "delete every application of this user".
  if (!applicationId) {
    redirect("/applications");
  }

  // deleteMany rather than delete, because it takes a full where clause and
  // simply affects zero rows when the id belongs to someone else. `delete`
  // only accepts a unique field and would throw on a foreign id, which means
  // writing the ownership check separately and being able to forget it.
  await prisma.application.deleteMany({ where: { id: applicationId, userId } });

  revalidatePath("/applications");
  redirect("/applications");
}

/**
 * A single move along the pipeline, for the buttons on the detail page. No
 * form, no validation of the other fields, just this one step.
 */
export async function advanceStatus(id: string, to: Status): Promise<void> {
  const userId = await requireUserId();
  const applicationId = parseApplicationId(id);

  if (!applicationId) {
    redirect("/applications");
  }

  const existing = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, status: true },
  });

  if (!existing) {
    redirect("/applications");
  }

  // `to` travels through the browser just like the id, so it is parsed and then
  // held against the rules. The same check also catches a page that was
  // rendered before the application moved on in another tab.
  const target = statusSchema.safeParse(to);

  if (
    !target.success ||
    target.data === existing.status ||
    !canTransition(existing.status, target.data)
  ) {
    redirect(`/applications/${existing.id}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id: existing.id }, data: { status: target.data } });
    await tx.statusEvent.create({
      data: { applicationId: existing.id, from: existing.status, to: target.data },
    });
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${existing.id}`);
  redirect(`/applications/${existing.id}`);
}
