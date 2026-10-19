/**
 * Small stand-ins for what Next does around a Server Action, so the actions
 * can run in a test exactly as written.
 */

/**
 * redirect() from next/navigation does not return, it throws an error that
 * Next catches and turns into a response. Outside of Next nobody catches it,
 * so the tests do, and read the target from the error's digest, which has the
 * shape NEXT_REDIRECT;type;url;status;.
 */
export async function redirectTarget(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;

    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
      return digest.split(";").slice(2, -2).join(";");
    }

    throw error;
  }

  throw new Error("Expected the action to redirect, but it returned normally.");
}

/** A FormData with the given fields, the way a browser would send the form. */
export function form(fields: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
}
