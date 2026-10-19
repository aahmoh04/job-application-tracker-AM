import { headers } from "next/headers";

/**
 * The visitor's address, as the host in front of the app reports it.
 *
 * x-forwarded-for is a list every proxy appends to, so its first entry is
 * whatever the client claimed, and it is only trustworthy when the host
 * replaces it. Vercel does, for both headers read here. Behind a host that
 * passes them through untouched an attacker could send a new address with
 * every request, which is why the limit per account does not look at the
 * address at all. Locally neither header is set, and every request shares
 * one bucket.
 */
export async function clientAddress(): Promise<string> {
  const list = await headers();

  return (
    list.get("x-real-ip")?.trim() || list.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
