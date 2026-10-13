/**
 * Whether a GitHub sign-in may attach itself to an existing account with the
 * same email address.
 *
 * GitHub vouches for the address, our own sign-up does not, because it sends
 * no confirmation mail. A password account therefore proves nothing about who
 * owns its address. Anyone could register a stranger's address with a password
 * of their own and wait. Linking GitHub onto that account would let the real
 * owner sign in and fill an account whose password someone else knows.
 *
 * Sign-up always sets a password, so an account without one was created by a
 * GitHub sign-in, and GitHub verified its address as well. Linking onto it
 * trusts nothing that GitHub has not checked.
 *
 * Removing the password and linking anyway would not help. Sessions are signed
 * JWTs with no table behind them, so a session the other person already holds
 * would stay valid until it expires. Once sign-up confirms addresses, confirmed
 * password accounts can be linked as well.
 *
 * Kept in its own module, so the test can import it without loading the
 * database client.
 */
export function canLinkByEmail(user: { passwordHash: string | null }): boolean {
  return user.passwordHash === null;
}
