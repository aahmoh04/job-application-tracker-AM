import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters from the OWASP Password Storage Cheat Sheet.
 * 19 MiB of memory, 2 passes, no parallelism.
 *
 * These numbers are the point of the whole thing. They make a single hash take
 * roughly 100 ms, which nobody notices when logging in, and which turns a
 * stolen database into a wall for anyone trying to guess their way through it.
 * The memory cost is what hurts GPU-based cracking specifically, because
 * thousands of cores cannot each be given 19 MiB.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Returns a self-describing digest that contains the algorithm, the parameters
 * and a random salt, so verification needs nothing but this one string.
 */
export function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, plainPassword: string): Promise<boolean> {
  try {
    return await verify(digest, plainPassword);
  } catch {
    // A malformed or truncated digest should behave exactly like a wrong
    // password. Anything else would let a caller distinguish the two.
    return false;
  }
}
