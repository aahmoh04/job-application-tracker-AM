/**
 * GitHub OAuth, the provider-specific half.
 *
 * Everything here is plain fetch against documented endpoints. There is no
 * OAuth library, on purpose, because the whole point of M03 is to know what
 * actually travels over the wire.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_URL = "https://api.github.com";

// read:user gets the profile, user:email gets the address list including
// addresses the user keeps private. We ask for nothing else.
const SCOPE = "read:user user:email";

export const OAUTH_STATE_COOKIE = "github_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "github_oauth_verifier";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10; // ten minutes to finish

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set. Add it to .env, see .env.example.`);
  }

  return value;
}

export function getCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/auth/github/callback`;
}

/** A URL-safe random string, used for both the state and the PKCE verifier. */
export function randomUrlSafeToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** SHA-256 of the verifier, base64url encoded. This is what GitHub stores. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTHORIZE_URL);

  url.searchParams.set("client_id", requireEnv("GITHUB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getCallbackUrl());
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

/**
 * Server-to-server. The code alone is worthless, it only becomes a token
 * together with the client secret, and the secret never leaves this process.
 */
export async function exchangeCodeForAccessToken(
  code: string,
  codeVerifier: string,
): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      // Without this GitHub answers with a URL-encoded body instead of JSON.
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: getCallbackUrl(),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) return null;

  // GitHub answers with HTTP 200 even for errors, the error sits in the body.
  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null) return null;

  const token = (data as { access_token?: unknown }).access_token;

  return typeof token === "string" ? token : null;
}

export type GitHubIdentity = {
  providerAccountId: string;
  email: string;
};

type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

async function githubApi(path: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub rejects requests without one.
      "User-Agent": "job-application-tracker",
    },
  });

  if (!response.ok) return null;

  return response.json();
}

/**
 * Returns the account id and a verified email, or null.
 *
 * The `verified` check is the important line in this file. Anyone can put any
 * address into their GitHub profile. Only a verified one proves that they
 * actually control that mailbox, and we later use the address to link this
 * login to an existing account. Skipping the check would let someone take over
 * a password account by claiming its address on GitHub.
 */
export async function fetchGitHubIdentity(accessToken: string): Promise<GitHubIdentity | null> {
  const profile = await githubApi("/user", accessToken);

  if (typeof profile !== "object" || profile === null) return null;

  const id = (profile as { id?: unknown }).id;

  if (typeof id !== "number" && typeof id !== "string") return null;

  const emails = await githubApi("/user/emails", accessToken);

  if (!Array.isArray(emails)) return null;

  const usable = (emails as GitHubEmail[]).filter((entry) => entry?.verified === true);
  const chosen = usable.find((entry) => entry.primary) ?? usable[0];

  if (!chosen?.email) return null;

  return {
    providerAccountId: String(id),
    email: chosen.email.trim().toLowerCase(),
  };
}
