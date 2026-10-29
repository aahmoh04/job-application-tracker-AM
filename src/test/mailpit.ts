import { randomUUID } from "node:crypto";

/**
 * Reads what arrived in Mailpit. Every test sends to an address of its own,
 * so nothing ever has to be deleted, and the mails a developer keeps in the
 * local inbox survive a test run.
 */

type Summary = { ID: string; Subject: string };

function mailpit(path: string): URL {
  const base = process.env.MAILPIT_URL;

  if (!base) {
    throw new Error("MAILPIT_URL is not set.");
  }

  return new URL(path, base);
}

/** An address nobody else uses, for one test. */
export function freshAddress(name: string): string {
  return `${name}-${randomUUID()}@example.com`;
}

/** The mails sent to this address, newest first. */
export async function inbox(address: string): Promise<Summary[]> {
  const url = mailpit("/api/v1/search");
  url.searchParams.set("query", `to:"${address}"`);

  const response = await fetch(url);
  const { messages } = (await response.json()) as { messages: Summary[] };

  return messages;
}

/** One mail with its bodies. */
export async function message(
  id: string,
): Promise<{ Subject: string; HTML: string; Text: string }> {
  const response = await fetch(mailpit(`/api/v1/message/${id}`));
  return response.json();
}
