import { escapeHtml } from "@/lib/mail/html";
import type { Mail } from "@/lib/mail/send";

/** The mail with the link to choose a new password. */

const NOTE =
  "The link works for one hour and only once. Saving a new password signs out every device that is signed in to the account. If you did not ask for this, ignore this mail, your password stays as it is.";

export function passwordResetMail(to: string, url: string): Mail {
  const text = [
    "Someone asked to reset the password of the JobTracker account for this address. Open this link to choose a new one.",
    "",
    url,
    "",
    NOTE,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.5">
    <p>Someone asked to reset the password of the JobTracker account for this address.</p>
    <p><a href="${escapeHtml(url)}">Choose a new password</a></p>
    <p style="color: #71717a; font-size: 12px">${NOTE}</p>
  </body>
</html>`;

  return { to, subject: "Reset your JobTracker password", html, text };
}
