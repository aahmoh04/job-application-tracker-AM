import { SignJWT, decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const session = { userId: "user_abc123" };

/** A token signed with the test secret, for payloads the app itself never writes. */
function signed(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSessionToken", () => {
  it("produces a token that verifies back to the same session", async () => {
    const token = await createSessionToken(session);
    await expect(verifySessionToken(token)).resolves.toEqual(session);
  });

  it("says who someone is and nothing about what they may do", async () => {
    const token = await createSessionToken(session);
    expect(decodeJwt(token)).not.toHaveProperty("role");
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
    const forged = Buffer.from(JSON.stringify({ sub: "someone_else" })).toString("base64url");

    await expect(verifySessionToken(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await createSessionToken(session);
    vi.stubEnv("JWT_SECRET", "a-completely-different-secret-of-sufficient-length");

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const expired = await new SignJWT({})
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

  it("returns null for a token that names nobody", async () => {
    await expect(verifySessionToken(await signed({}))).resolves.toBeNull();
  });

  it("accepts a token from before the role moved out and ignores the role in it", async () => {
    const old = await signed({ sub: session.userId, role: "ADMIN" });

    await expect(verifySessionToken(old)).resolves.toEqual(session);
  });
});
