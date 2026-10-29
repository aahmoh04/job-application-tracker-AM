import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import { freshAddress, inbox } from "@/test/mailpit";
import { GET } from "./route";

const SECRET = "a-long-random-cron-secret-only-for-these-tests";
const DAY = 86_400_000;

/** The request Vercel Cron sends, with whatever authorization header it carries. */
function cronRequest(authorization?: string) {
  return new NextRequest("http://localhost:3000/api/cron/reminders", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

let address: string;
let applicationId: string;

beforeEach(async () => {
  await resetDatabase();
  vi.stubEnv("CRON_SECRET", SECRET);

  address = freshAddress("cron");
  const user = await createUser(address, { verified: true });
  const application = await createApplication(user.id, {
    status: "APPLIED",
    followUpAt: new Date(Date.now() - 2 * DAY),
    events: [{ to: "APPLIED", at: new Date(Date.now() - 10 * DAY) }],
  });
  applicationId = application.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function reminded() {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  });
  return application.reminderSentAt !== null;
}

describe("the reminder route", () => {
  it("runs the job when the cron brings the right secret", async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: 1, mails: 1, failed: 0 });
    expect(await reminded()).toBe(true);
    expect(await inbox(address)).toHaveLength(1);
  });

  it("turns away a request without the secret or with a wrong one, and sends nothing", async () => {
    for (const authorization of [undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`]) {
      expect((await GET(cronRequest(authorization))).status).toBe(401);
    }

    expect(await reminded()).toBe(false);
    expect(await inbox(address)).toHaveLength(0);
  });

  it("stays closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    // An empty secret must not turn "Bearer " into a valid key.
    expect((await GET(cronRequest("Bearer "))).status).toBe(503);
    expect(await reminded()).toBe(false);
  });

  it("claims nothing when no mail transport is configured", async () => {
    vi.stubEnv("MAILPIT_URL", "");

    expect((await GET(cronRequest(`Bearer ${SECRET}`))).status).toBe(503);
    expect(await reminded()).toBe(false);
  });
});
