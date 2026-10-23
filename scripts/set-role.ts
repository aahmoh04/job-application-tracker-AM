/**
 * Gives an account a role, for example the first admin.
 *
 *   npm run user:role -- someone@example.com ADMIN
 *   npm run user:role -- someone@example.com USER
 *
 * It applies with the account's next request, without signing in again,
 * because the guard reads the role from the database every time. Uses the
 * DATABASE_URL from .env, like the seed.
 */

import "dotenv/config";
import { setRole } from "../src/lib/admin/roles";
import { prisma } from "../src/lib/db";

async function main() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error("Usage: npm run user:role -- <email> <ADMIN|USER>");
    process.exitCode = 1;
    return;
  }

  const result = await setRole(email, role);

  if (!result) {
    console.error(`No account uses ${email}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${result.email} is now ${result.role}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
