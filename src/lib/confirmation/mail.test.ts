import { describe, expect, it } from "vitest";
import { confirmationMail } from "./mail";

const LINK = "http://localhost:3000/confirm-email?token=abc";

describe("confirmationMail", () => {
  it("goes to the address and carries the link in the text and in the HTML", () => {
    const mail = confirmationMail("me@example.com", LINK);

    expect(mail.to).toBe("me@example.com");
    expect(mail.subject).toBe("Confirm your email address for JobTracker");
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain(`href="${LINK}"`);
  });

  it("escapes the link inside the HTML attribute", () => {
    const mail = confirmationMail("me@example.com", `${LINK}&next="x"`);

    expect(mail.html).toContain(`href="${LINK}&amp;next=&quot;x&quot;"`);
  });

  it("tells someone who never signed up what ignoring it means", () => {
    const mail = confirmationMail("me@example.com", LINK);

    expect(mail.text).toContain("If you did not create an account, ignore this mail.");
    expect(mail.text).toContain("JobTracker sends no reminders to this address");
  });
});
