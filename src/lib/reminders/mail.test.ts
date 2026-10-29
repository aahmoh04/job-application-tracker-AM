import { describe, expect, it } from "vitest";
import { escapeHtml, reminderMail, type DueFollowUp } from "./mail";

const APP_URL = "http://localhost:3000";

function followUp(overrides: Partial<DueFollowUp> = {}): DueFollowUp {
  return {
    id: "app_1",
    role: "Junior Developer",
    company: "Northwind",
    followUpAt: new Date("2026-10-28T00:00:00Z"),
    ...overrides,
  };
}

describe("reminderMail", () => {
  it("goes to the given address and names the company when one follow-up is due", () => {
    const mail = reminderMail("me@example.com", [followUp()], APP_URL);

    expect(mail.to).toBe("me@example.com");
    expect(mail.subject).toBe("Time to follow up with Northwind");
  });

  it("counts them when several are due", () => {
    const mail = reminderMail("me@example.com", [followUp(), followUp({ id: "app_2" })], APP_URL);

    expect(mail.subject).toBe("Time to follow up on 2 applications");
  });

  it("links every follow-up to its application, in the text and in the HTML", () => {
    const mail = reminderMail(
      "me@example.com",
      [followUp(), followUp({ id: "app_2", role: "Data Engineer", company: "Kestrel" })],
      APP_URL,
    );

    expect(mail.text).toContain("Junior Developer at Northwind, due 28 Oct 2026");
    expect(mail.text).toContain("http://localhost:3000/applications/app_1");
    expect(mail.html).toContain('href="http://localhost:3000/applications/app_2"');
    expect(mail.html).toContain("Data Engineer at Kestrel");
  });

  it("escapes what the user typed, so it stays text in the HTML", () => {
    const mail = reminderMail(
      "me@example.com",
      [followUp({ role: '<img src=x onerror="alert(1)">', company: "Tom & Jerry's" })],
      APP_URL,
    );

    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(mail.html).toContain("Tom &amp; Jerry&#39;s");
    // The plain text has nothing to escape and shows what was typed.
    expect(mail.text).toContain("Tom & Jerry's");
  });

  it("keeps the subject on one line, whatever the company name holds", () => {
    const mail = reminderMail(
      "me@example.com",
      [followUp({ company: "Northwind\r\nBcc: someone@example.com" })],
      APP_URL,
    );

    expect(mail.subject).toBe("Time to follow up with Northwind Bcc: someone@example.com");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe("escapeHtml", () => {
  it("turns the five characters that mean something in HTML into entities", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});
