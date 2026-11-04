import { afterEach, describe, expect, it, vi } from "vitest";
import { hashLinkToken, linkTokenSchema, linkUrl, newLinkToken } from "./link-token";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("link tokens", () => {
  it("are 32 random bytes, different every time", () => {
    const first = newLinkToken();

    // 32 bytes are 43 characters in base64url, without padding.
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newLinkToken()).not.toBe(first);
  });

  it("hash to the same 64 hex digits every time, so a link can be found by its hash", () => {
    const token = newLinkToken();

    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).toBe(hashLinkToken(token));
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it("go into a link on the public address of the app", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://jobs.example");

    expect(linkUrl("/reset-password", "abc")).toBe("https://jobs.example/reset-password?token=abc");
  });

  it("only count as a token when they come back as a string of sane length", () => {
    expect(linkTokenSchema.safeParse(newLinkToken()).success).toBe(true);
    expect(linkTokenSchema.safeParse("").success).toBe(false);
    expect(linkTokenSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(linkTokenSchema.safeParse({ not: "a token" }).success).toBe(false);
    expect(linkTokenSchema.safeParse(null).success).toBe(false);
  });
});
