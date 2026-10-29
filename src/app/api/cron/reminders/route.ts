import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mailConfigured } from "@/lib/mail/send";
import { sendDueReminders } from "@/lib/reminders/job";

/**
 * The daily trigger for the reminder mails. Vercel Cron calls it at the time
 * in vercel.json and sends CRON_SECRET as a bearer token. A cron job is only
 * an alarm clock that calls an address, so without the secret anyone who
 * knows the address could fire the job.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Without a secret the route stays closed rather than open to everyone.
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }

  if (!sameSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Checked before anything is claimed. A run that cannot send would claim
  // every due follow-up only to give them all back again.
  if (!mailConfigured()) {
    return NextResponse.json({ error: "No mail transport is configured." }, { status: 503 });
  }

  return NextResponse.json(await sendDueReminders(new Date()));
}

/**
 * Compares in constant time, so how long the answer takes reveals nothing
 * about how much of the secret was right. Hashing first gives both sides the
 * same length, which timingSafeEqual requires.
 */
function sameSecret(given: string | null, expected: string): boolean {
  const a = createHash("sha256")
    .update(given ?? "")
    .digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}
