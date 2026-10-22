import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { invalidateCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { closeRedis } from "@/lib/redis";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import { resetRedis } from "@/test/redis";
import { getAnalytics } from "./cached";
import {
  applicationsPerWeek,
  funnel,
  quietApplications,
  responseBySource,
  timeInStage,
} from "./queries";

// A fixed clock, a Wednesday at noon.
const NOW = new Date("2026-10-21T12:00:00Z");
const DAY = 86_400_000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY);
}

let me: string;
let stranger: string;

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  me = (await createUser("me@example.com")).id;
  stranger = (await createUser("stranger@example.com")).id;

  // One application that made it to the interview, one that has been quiet
  // for ten days and has had no answer yet.
  await createApplication(me, {
    status: "INTERVIEW",
    source: "REFERRAL",
    appliedAt: daysAgo(20),
    events: [
      { to: "APPLIED", at: daysAgo(20) },
      { to: "SCREENING", at: daysAgo(15) },
      { to: "INTERVIEW", at: daysAgo(9) },
    ],
  });
  await createApplication(me, {
    status: "APPLIED",
    source: "JOB_BOARD",
    company: "Quiet Company",
    appliedAt: daysAgo(10),
    events: [{ to: "APPLIED", at: daysAgo(10) }],
  });
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

describe("the cached analytics", () => {
  it("answer from Redis exactly what Postgres answered, until a write invalidates them", async () => {
    const fromPostgres = {
      weeks: await applicationsPerWeek(me, NOW),
      funnel: await funnel(me),
      sources: await responseBySource(me),
      durations: await timeInStage(me),
      quiet: await quietApplications(me, NOW),
    };

    expect(await getAnalytics(me, NOW)).toStrictEqual(fromPostgres);

    // Written behind the cache's back, so only a fresh computation counts it.
    await createApplication(me, {
      status: "APPLIED",
      events: [{ to: "APPLIED", at: daysAgo(1) }],
    });

    expect(await getAnalytics(me, NOW)).toStrictEqual(fromPostgres);

    await invalidateCache(me);

    expect((await getAnalytics(me, NOW)).funnel.applied).toBe(3);
  });

  it("never hand one user's numbers to another", async () => {
    expect((await getAnalytics(me, NOW)).funnel.applied).toBe(2);
    expect((await getAnalytics(stranger, NOW)).funnel).toEqual({
      applied: 0,
      screening: 0,
      interview: 0,
      offer: 0,
    });
  });
});
