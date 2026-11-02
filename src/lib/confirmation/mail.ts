import { escapeHtml } from "@/lib/mail/html";
import type { Mail } from "@/lib/mail/send";

/** The mail with the confirmation link, sent at sign-up and on request. */

const NOTE =
  "The link works for 24 hours. If you did not create an account, ignore this mail. Until someone clicks it, JobTracker sends no reminders to this address.";

export function confirmationMail(to: string, url: string): Mail {
  const text = [
    "Please confirm that this address belongs to you by opening this link.",
    "",
    url,
    "",
    NOTE,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.5">
    <p>Please confirm that this address belongs to you.</p>
    <p><a href="${escapeHtml(url)}">Confirm my address</a></p>
    <p style="color: #71717a; font-size: 12px">${NOTE}</p>
  </body>
</html>`;

  return { to, subject: "Confirm your email address for JobTracker", html, text };
}
