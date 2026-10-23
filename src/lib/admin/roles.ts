import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { emailSchema } from "@/lib/validation/auth";

/**
 * Roles change here and nowhere else, run through `npm run user:role`. The app
 * has no page and no action that writes a role, so no bug in it can make
 * someone an admin. Whoever can run this script has the database credentials
 * already, which makes them the right person to decide.
 *
 * Not a list of admin emails in an environment variable either. Sign-up does
 * not confirm addresses yet, so anyone could register that address first.
 */

const input = z.object({
  email: emailSchema,
  role: z.enum(Role),
});

/**
 * Gives the account with this email the role. Returns what was set, or null
 * when no account uses the address. Throws for an invalid email or role.
 */
export async function setRole(
  email: string,
  role: string,
): Promise<{ email: string; role: Role } | null> {
  const parsed = input.parse({ email, role });

  const { count } = await prisma.user.updateMany({
    where: { email: parsed.email },
    data: { role: parsed.role },
  });

  return count === 0 ? null : parsed;
}
