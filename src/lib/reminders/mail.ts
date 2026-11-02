import { dateFormat } from "@/lib/format";
import { escapeHtml, oneLine } from "@/lib/mail/html";
import type { Mail } from "@/lib/mail/send";

/**
 * The reminder mail, one per user and run, listing every follow-up that came
 * due. Everything the user typed is escaped before it goes into the HTML.
 */

export type DueFollowUp = {
  id: string;
  role: string;
  company: string;
  followUpAt: Date;
};

const FOOTER = "You get this mail because you set a follow-up date in JobTracker.";

export function reminderMail(to: string, items: DueFollowUp[], appUrl: string): Mail {
  const subject =
    items.length === 1
      ? `Time to follow up with ${oneLine(items[0].company)}`
      : `Time to follow up on ${items.length} applications`;

  const rows = items.map((item) => ({
    role: item.role,
    company: item.company,
    url: new URL(`/applications/${item.id}`, appUrl).toString(),
    due: dateFormat.format(item.followUpAt),
  }));

  const text = [
    "These follow-ups are due:",
    "",
    ...rows.map((row) => `- ${row.role} at ${row.company}, due ${row.due}\n  ${row.url}`),
    "",
    FOOTER,
  ].join("\n");

  const list = rows
    .map(
      (row) =>
        `<li style="margin-bottom: 8px"><a href="${escapeHtml(row.url)}">${escapeHtml(row.role)} at ${escapeHtml(row.company)}</a>, due ${escapeHtml(row.due)}</li>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.5">
    <p>These follow-ups are due:</p>
    <ul>
${list}
    </ul>
    <p style="color: #71717a; font-size: 12px">${FOOTER}</p>
  </body>
</html>`;

  return { to, subject, html, text };
}
