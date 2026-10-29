import { afterEach, describe, expect, it, vi } from "vitest";
import { mailConfigured, sendMail } from "./send";

const MAIL = { to: "me@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

/** Stands in for fetch, records every request and answers with this status. */
function fakeFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];

  vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
    calls.push({ url: url.toString(), init });
    return new Response("{}", { status });
  });

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendMail", () => {
  it("goes to Resend when an API key is set, even with Mailpit around", async () => {
    vi.stubEnv("MAIL_FROM", "reminders@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:8025");
    const calls = fakeFetch();

    await sendMail(MAIL);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      from: "JobTracker <reminders@example.com>",
      to: ["me@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("goes to Mailpit when only its address is set", async () => {
    vi.stubEnv("MAIL_FROM", "reminders@example.com");
    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:8025");
    const calls = fakeFetch();

    await sendMail(MAIL);

    expect(calls[0].url).toBe("http://127.0.0.1:8025/api/v1/send");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      From: { Email: "reminders@example.com", Name: "JobTracker" },
      To: [{ Email: "me@example.com" }],
      Subject: "Hello",
      HTML: "<p>Hi</p>",
      Text: "Hi",
    });
  });

  it("throws when the provider refuses the mail", async () => {
    vi.stubEnv("MAIL_FROM", "reminders@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    fakeFetch(422);

    await expect(sendMail(MAIL)).rejects.toThrow("Resend refused the mail with status 422.");
  });

  it("sends nothing without a sender address or a transport", async () => {
    const calls = fakeFetch();

    await expect(sendMail(MAIL)).rejects.toThrow("MAIL_FROM is not set.");

    vi.stubEnv("MAIL_FROM", "reminders@example.com");
    await expect(sendMail(MAIL)).rejects.toThrow("No mail transport configured.");

    expect(calls).toHaveLength(0);
  });
});

describe("mailConfigured", () => {
  it("needs a sender address and one of the two transports", () => {
    expect(mailConfigured()).toBe(false);

    vi.stubEnv("MAIL_FROM", "reminders@example.com");
    expect(mailConfigured()).toBe(false);

    vi.stubEnv("MAILPIT_URL", "http://127.0.0.1:8025");
    expect(mailConfigured()).toBe(true);
  });
});
