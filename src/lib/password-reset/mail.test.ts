import { describe, expect, it } from "vitest";
import { passwordResetMail } from "./mail";

const LINK = "http://localhost:3000/reset-password?token=abc";

describe("passwordResetMail", () => {
  it("goes to the address and carries the link in the text and in the HTML", () => {
    const mail = passwordResetMail("me@example.com", LINK);

    expect(mail.to).toBe("me@example.com");
    expect(mail.subject).toBe("Reset your JobTracker password");
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain(`href="${LINK}"`);
  });

  it("escapes the link inside the HTML attribute", () => {
    const mail = passwordResetMail("me@example.com", `${LINK}&next="x"`);

    expect(mail.html).toContain(`href="${LINK}&amp;next=&quot;x&quot;"`);
  });

  it("tells someone who did not ask for it that nothing changes", () => {
    const mail = passwordResetMail("me@example.com", LINK);

    expect(mail.text).toContain("If you did not ask for this, ignore this mail");
    expect(mail.text).toContain("your password stays as it is");
    expect(mail.text).toContain("works for one hour and only once");
  });
});
