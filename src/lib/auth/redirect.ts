/**
 * Where to send someone after signing in. The proxy remembers the page they
 * asked for in `?next=`, but that value comes back from the browser, so it is
 * checked like any other input.
 *
 * Only a path on this site is accepted. Without the check, a link such as
 * /sign-in?next=https://evil.example would turn our own sign-in page into a
 * springboard for phishing, an open redirect. Resolving the value against a
 * placeholder origin lets the URL parser decide, which also catches what a
 * hand-written check tends to miss, like "//evil.example" or a backslash that
 * browsers read as a slash.
 */

export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

const PLACEHOLDER_ORIGIN = "http://placeholder.invalid";

export function safeRedirectPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    !URL.canParse(value, PLACEHOLDER_ORIGIN)
  ) {
    return DEFAULT_AFTER_SIGN_IN;
  }

  const url = new URL(value, PLACEHOLDER_ORIGIN);

  if (url.origin !== PLACEHOLDER_ORIGIN) {
    return DEFAULT_AFTER_SIGN_IN;
  }

  return `${url.pathname}${url.search}`;
}
