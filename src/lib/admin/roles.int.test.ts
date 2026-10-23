import { execFileSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetDatabase } from "@/test/database";
import { setRole } from "./roles";

beforeEach(async () => {
  await resetDatabase();
  await createUser("me@example.com");
  await createUser("someone@example.com");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function roleOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { role: true } });
  return user.role;
}

describe("setRole", () => {
  it("finds the account the way sign-in does, whatever the spelling", async () => {
    expect(await setRole("  Me@Example.COM ", "ADMIN")).toEqual({
      email: "me@example.com",
      role: "ADMIN",
    });
    expect(await roleOf("me@example.com")).toBe("ADMIN");
    expect(await roleOf("someone@example.com")).toBe("USER");
  });

  it("takes the role away again", async () => {
    await setRole("me@example.com", "ADMIN");
    await setRole("me@example.com", "USER");

    expect(await roleOf("me@example.com")).toBe("USER");
  });

  it("answers null for an address nobody uses and changes nothing", async () => {
    expect(await setRole("nobody@example.com", "ADMIN")).toBeNull();
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(0);
  });

  it("refuses a role that does not exist", async () => {
    await expect(setRole("me@example.com", "SUPERUSER")).rejects.toThrow();
    expect(await roleOf("me@example.com")).toBe("USER");
  });
});

describe("npm run user:role", () => {
  it("runs as a script against the database in DATABASE_URL", async () => {
    // The real script in a child process, which inherits the test database.
    const output = execFileSync("npx", ["tsx", "scripts/set-role.ts", "me@example.com", "ADMIN"], {
      encoding: "utf8",
    });

    expect(output).toContain("me@example.com is now ADMIN.");
    expect(await roleOf("me@example.com")).toBe("ADMIN");
  });
});
