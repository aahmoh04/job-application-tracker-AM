import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const session = { userId: "user_abc123", role: "USER" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSessionToken", () => {
  it("produces a token that verifies back to the same session", async () => {
    const token = await createSessionToken(session);
    await expect(verifySessionToken(token)).resolves.toEqual(session);
  });

  it("refuses to sign without a usable secret", async () => {
    vi.stubEnv("JWT_SECRET", "too-short");
    await expect(createSessionToken(session)).rejects.toThrow(/JWT_SECRET/);
  });
});

describe("verifySessionToken", () => {
  it("returns null for a tampered payload", async () => {
    const token = await createSessionToken(session);
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "someone_else", role: "ADMIN" })).toString(
      "base64url",
    );

    await expect(verifySessionToken(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await createSessionToken(session);
    vi.stubEnv("JWT_SECRET", "a-completely-different-secret-of-sufficient-length");

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const expired = await new SignJWT({ role: "USER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(session.userId)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret);

    await expect(verifySessionToken(expired)).resolves.toBeNull();
  });

  it("returns null for malformed input", async () => {
    await expect(verifySessionToken("not-a-token")).resolves.toBeNull();
    await expect(verifySessionToken("")).resolves.toBeNull();
  });

  it("returns null when the payload is missing the fields we rely on", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const withoutRole = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(session.userId)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    await expect(verifySessionToken(withoutRole)).resolves.toBeNull();
  });
});
