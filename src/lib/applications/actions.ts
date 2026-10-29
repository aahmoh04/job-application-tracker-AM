"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Status } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/guard";
import { invalidateCache } from "@/lib/cache";
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
 * Every action checks who is calling by itself. The proxy keeps anonymous
 * visitors off the pages, and the layout checks again, but a Server Action is
 * its own endpoint and can be called without ever loading a page.
 */
async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
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

  // The analytics count this application from now on. Invalidated after the
  // write and not before, otherwise a page view at the same moment could still
  // read the old data and cache it as current. The same holds for every write
  // below.
  await invalidateCache(userId);

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
    select: { id: true, status: true, followUpAt: true },
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

  // An emptied field arrives as undefined, and Prisma reads undefined as
  // "leave it as it is". On an edit the user means "remove it", so every
  // optional field is written as null instead. Before this, a cleared
  // follow-up date, note, link or salary quietly kept its old value.
  const values = {
    ...fields,
    salaryMin: fields.salaryMin ?? null,
    salaryMax: fields.salaryMax ?? null,
    postingUrl: fields.postingUrl ?? null,
    notes: fields.notes ?? null,
    appliedAt: fields.appliedAt ?? null,
    followUpAt: fields.followUpAt ?? null,
  };

  // A new follow-up date is a new reminder. The old timestamp belongs to the
  // date it was sent for and would otherwise keep the new one silent.
  const followUpMoved = values.followUpAt?.getTime() !== existing.followUpAt?.getTime();

  // Both writes in one transaction. A status change that is saved without its
  // history entry would leave a timeline that quietly lies.
  //
  // The status the rule was checked against goes into the where clause. If a
  // second tab moved the application between the read above and this write,
  // the row no longer matches and nothing is saved. Otherwise both requests
  // could pass the check against the same old status.
  const saved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: existing.id, userId, status: existing.status },
      data: {
        ...values,
        status,
        companyId: company.id,
        ...(followUpMoved ? { reminderSentAt: null } : {}),
      },
    });

    if (count === 0) {
      return false;
    }

    if (statusChanged) {
      await tx.statusEvent.create({
        data: { applicationId: existing.id, from: existing.status, to: status },
      });
    }

    return true;
  });

  if (!saved) {
    return {
      message:
        "This application changed somewhere else while you were editing, nothing was saved. Reload the page to see where it stands now.",
      values: raw,
    };
  }

  // On every save, not only on a status change. The source, the date sent and
  // the role feed the analytics as well.
  await invalidateCache(userId);

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

  // deleteMany rather than delete. Both accept the user id in the where clause,
  // but `delete` throws when nothing matches, while `deleteMany` simply affects
  // zero rows. A foreign id and a missing one end the same way, without a
  // try/catch around it that someone could get wrong.
  const { count } = await prisma.application.deleteMany({ where: { id: applicationId, userId } });

  if (count > 0) {
    await invalidateCache(userId);
  }

  revalidatePath("/applications");
  redirect("/applications");
}

type TransitionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "not-allowed"; id: string };

/**
 * One step along the pipeline, shared by the buttons on the detail page and the
 * board. It decides and writes, but it does not answer the browser. That part
 * differs between the two callers, one redirects and the other returns data.
 */
async function transitionApplication(
  userId: string,
  id: unknown,
  to: unknown,
): Promise<TransitionResult> {
  const applicationId = parseApplicationId(id);

  if (!applicationId) {
    return { ok: false, reason: "not-found" };
  }

  const existing = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, status: true },
  });

  if (!existing) {
    return { ok: false, reason: "not-found" };
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
    return { ok: false, reason: "not-allowed", id: existing.id };
  }

  // Same guard as in updateApplication. The status checked above goes into the
  // where clause, so a move made elsewhere in the meantime makes this one
  // match nothing instead of slipping past the rules.
  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: existing.id, userId, status: existing.status },
      data: { status: target.data },
    });

    if (count === 0) {
      return false;
    }

    await tx.statusEvent.create({
      data: { applicationId: existing.id, from: existing.status, to: target.data },
    });

    return true;
  });

  if (!moved) {
    return { ok: false, reason: "not-allowed", id: existing.id };
  }

  await invalidateCache(userId);

  return { ok: true, id: existing.id };
}

/**
 * For the buttons on the detail page. A form post, so the answer is a redirect
 * back to the page, whether the move worked or not.
 */
export async function advanceStatus(id: string, to: Status): Promise<void> {
  const userId = await requireUserId();
  const result = await transitionApplication(userId, id, to);

  if (!result.ok) {
    redirect(result.reason === "not-found" ? "/applications" : `/applications/${result.id}`);
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${result.id}`);
  redirect(`/applications/${result.id}`);
}

export type MoveResult = { ok: true } | { ok: false; message: string };

/**
 * For the board, which calls this straight from the browser while a dragged
 * card already sits in its new column. A redirect would reload the page under
 * the user's hands, so this returns what happened and lets the board react.
 */
export async function moveApplication(id: string, to: Status): Promise<MoveResult> {
  const userId = await requireUserId();
  const result = await transitionApplication(userId, id, to);

  // Revalidated in every case. When a move is refused, the board is usually out
  // of date, and the fresh render puts the card where it really is.
  revalidatePath("/applications");
  revalidatePath("/applications/board");

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "not-found"
          ? "That application no longer exists."
          : "That application has moved on in the meantime, so the board has been refreshed.",
    };
  }

  revalidatePath(`/applications/${result.id}`);
  return { ok: true };
}
