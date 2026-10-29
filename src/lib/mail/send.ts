/**
 * Sends one mail, through Resend when RESEND_API_KEY is set and through Mailpit
 * otherwise. Both take a single documented POST, so fetch does the job, the
 * same way the GitHub sign-in talks to GitHub without an SDK. Locally Mailpit
 * catches every mail in a test inbox at http://localhost:8025, and nothing
 * leaves the machine.
 */

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** The name next to the address in MAIL_FROM. */
const SENDER_NAME = "JobTracker";

// A provider that hangs should not hold a whole reminder run hostage.
const TIMEOUT_MS = 10_000;

/** True when a sender address and one of the two transports are set. */
export function mailConfigured(): boolean {
  return Boolean(process.env.MAIL_FROM && (process.env.RESEND_API_KEY || process.env.MAILPIT_URL));
}

export async function sendMail(mail: Mail): Promise<void> {
  const from = process.env.MAIL_FROM;

  if (!from) {
    throw new Error("MAIL_FROM is not set.");
  }

  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    return sendWithResend(resendKey, from, mail);
  }

  const mailpitUrl = process.env.MAILPIT_URL;

  if (mailpitUrl) {
    return sendWithMailpit(mailpitUrl, from, mail);
  }

  throw new Error("No mail transport configured. Set RESEND_API_KEY or MAILPIT_URL.");
}

/** https://resend.com/docs/api-reference/emails/send-email */
async function sendWithResend(key: string, from: string, mail: Mail): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${SENDER_NAME} <${from}>`,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Only the status goes into the error. The body could echo the mail back.
  if (!response.ok) {
    throw new Error(`Resend refused the mail with status ${response.status}.`);
  }
}

/** https://mailpit.axllent.org/docs/api-v1/view.html#post-/api/v1/send */
async function sendWithMailpit(baseUrl: string, from: string, mail: Mail): Promise<void> {
  const response = await fetch(new URL("/api/v1/send", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: from, Name: SENDER_NAME },
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      HTML: mail.html,
      Text: mail.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Mailpit refused the mail with status ${response.status}.`);
  }
}
