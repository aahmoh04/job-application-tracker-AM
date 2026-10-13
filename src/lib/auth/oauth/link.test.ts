import { describe, expect, it } from "vitest";
import { canLinkByEmail } from "./link";

describe("canLinkByEmail", () => {
  it("links onto an account without a password, which only a GitHub sign-in creates", () => {
    expect(canLinkByEmail({ passwordHash: null })).toBe(true);
  });

  it("never links onto an account with a password, because sign-up confirms no address", () => {
    expect(canLinkByEmail({ passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$..." })).toBe(false);
  });

  it("treats anything but null as a password, so a blank value fails closed", () => {
    expect(canLinkByEmail({ passwordHash: "" })).toBe(false);
  });
});
