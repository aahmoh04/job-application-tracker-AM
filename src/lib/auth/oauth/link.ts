/**
 * Whether a GitHub sign-in may attach itself to an existing account with the
 * same email address.
 *
 * GitHub vouches for the address. When this rule was written, our own sign-up
 * did not, so a password account proved nothing about who owns its address.
 * Anyone could register a stranger's address with a password of their own and
 * wait. Linking GitHub onto that account would let the real owner sign in and
 * fill an account whose password someone else knows.
 *
 * Sign-up always sets a password, so an account without one was created by a
 * GitHub sign-in, and GitHub verified its address as well. Linking onto it
 * trusts nothing that GitHub has not checked.
 *
 * Both reasons for the strict rule are gone by now. Sign-up confirms
 * addresses, and a password reset ends every session of an account through
 * its session version, so a session someone else holds no longer outlives a
 * takeover. Linking onto a confirmed password account would be safe. The rule
 * stays strict until that is decided on its own.
 *
 * Kept in its own module, so the test can import it without loading the
 * database client.
 */
export function canLinkByEmail(user: { passwordHash: string | null }): boolean {
  return user.passwordHash === null;
}
