import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import {
  WEEKS_SHOWN,
  applicationsPerWeek,
  funnel,
  quietApplications,
  responseBySource,
  timeInStage,
} from "./queries";

// A Thursday. The week it falls in starts on Monday, 12 October.
const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

let userId: string;
let strangerId: string;

beforeEach(async () => {
  await resetDatabase();
  userId = (await createUser("me@example.com")).id;
  strangerId = (await createUser("stranger@example.com")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("applicationsPerWeek", () => {
  it("returns every week of the range, including the empty ones", async () => {
    const weeks = await applicationsPerWeek(userId, NOW);

    expect(weeks).toHaveLength(WEEKS_SHOWN);
    expect(weeks[0].week).toBe("2026-07-27");
    expect(weeks.at(-1)?.week).toBe("2026-10-12");
    expect(weeks.every((week) => week.open + week.accepted + week.rejected === 0)).toBe(true);
  });

  it("puts each application into the week it was sent and splits by where it stands now", async () => {
    // Monday at midnight belongs to the new week, Sunday night to the old one.
    await createApplication(userId, {
      status: "APPLIED",
      appliedAt: new Date("2026-10-12T00:00:00Z"),
      events: [{ to: "APPLIED", at: daysAgo(3) }],
    });
    await createApplication(userId, {
      status: "REJECTED",
      appliedAt: new Date("2026-10-11T23:59:59Z"),
      events: [
        { to: "APPLIED", at: daysAgo(4) },
        { to: "REJECTED", at: daysAgo(1) },
      ],
    });
    await createApplication(userId, {
      status: "WITHDRAWN",
      appliedAt: new Date("2026-10-06T00:00:00Z"),
      events: [
        { to: "APPLIED", at: daysAgo(9) },
        { to: "WITHDRAWN", at: daysAgo(2) },
      ],
    });

    const weeks = await applicationsPerWeek(userId, NOW);
    const thisWeek = weeks.at(-1);
    const lastWeek = weeks.at(-2);

    expect(thisWeek).toMatchObject({ open: 1, accepted: 0, rejected: 0, endedByMe: 0 });
    expect(lastWeek).toMatchObject({ week: "2026-10-05", open: 0, rejected: 1, endedByMe: 1 });
  });

  it("leaves out drafts without a date, applications outside the range and other users", async () => {
    await createApplication(userId, {
      status: "DRAFT",
      events: [{ to: "DRAFT", at: daysAgo(1) }],
    });
    await createApplication(userId, {
      status: "ACCEPTED",
      appliedAt: new Date("2026-05-04T00:00:00Z"),
      events: [{ to: "APPLIED", at: new Date("2026-05-04T00:00:00Z") }],
    });
    await createApplication(strangerId, {
      status: "APPLIED",
      appliedAt: daysAgo(1),
      events: [{ to: "APPLIED", at: daysAgo(1) }],
    });

    const weeks = await applicationsPerWeek(userId, NOW);
    const total = weeks.reduce(
      (sum, week) => sum + week.open + week.accepted + week.rejected + week.endedByMe,
      0,
    );

    expect(total).toBe(0);
  });
});

describe("funnel", () => {
  it("is all zeros for someone who has not applied anywhere", async () => {
    expect(await funnel(userId)).toEqual({ applied: 0, screening: 0, interview: 0, offer: 0 });
  });

  it("counts how far each application got, not where it stands now", async () => {
    // Rejected after the interview, still counts up to the interview.
    await createApplication(userId, {
      status: "REJECTED",
      events: [
        { to: "DRAFT", at: daysAgo(30) },
        { to: "APPLIED", at: daysAgo(28) },
        { to: "SCREENING", at: daysAgo(20) },
        { to: "INTERVIEW", at: daysAgo(10) },
        { to: "REJECTED", at: daysAgo(5) },
      ],
    });
    // Entered straight as an interview, counts for the stages before it too.
    await createApplication(userId, {
      status: "INTERVIEW",
      events: [{ to: "INTERVIEW", at: daysAgo(3) }],
    });
    // All the way, an accepted offer implies the offer.
    await createApplication(userId, {
      status: "ACCEPTED",
      events: [
        { to: "APPLIED", at: daysAgo(40) },
        { to: "SCREENING", at: daysAgo(35) },
        { to: "INTERVIEW", at: daysAgo(25) },
        { to: "OFFER", at: daysAgo(15) },
        { to: "ACCEPTED", at: daysAgo(12) },
      ],
    });
    // Entered straight as rejected, which means it was sent.
    await createApplication(userId, {
      status: "REJECTED",
      events: [{ to: "REJECTED", at: daysAgo(2) }],
    });
    // Withdrawn as a draft, never sent.
    await createApplication(userId, {
      status: "WITHDRAWN",
      events: [
        { to: "DRAFT", at: daysAgo(9) },
        { to: "WITHDRAWN", at: daysAgo(8) },
      ],
    });
    await createApplication(strangerId, {
      status: "OFFER",
      events: [{ to: "OFFER", at: daysAgo(1) }],
    });

    expect(await funnel(userId)).toEqual({ applied: 4, screening: 3, interview: 3, offer: 1 });
  });
});

describe("responseBySource", () => {
  it("counts answers per source and takes the median time to the first one", async () => {
    await createApplication(userId, {
      status: "SCREENING",
      source: "JOB_BOARD",
      appliedAt: daysAgo(20),
      events: [
        { to: "APPLIED", at: daysAgo(20) },
        { to: "SCREENING", at: daysAgo(15) },
      ],
    });
    await createApplication(userId, {
      status: "REJECTED",
      source: "JOB_BOARD",
      appliedAt: daysAgo(30),
      events: [
        { to: "APPLIED", at: daysAgo(30) },
        { to: "REJECTED", at: daysAgo(20) },
      ],
    });
    // Sent, no answer yet.
    await createApplication(userId, {
      status: "APPLIED",
      source: "JOB_BOARD",
      appliedAt: daysAgo(10),
      events: [{ to: "APPLIED", at: daysAgo(10) }],
    });
    // Withdrawing is my move, not an answer.
    await createApplication(userId, {
      status: "WITHDRAWN",
      source: "DIRECT",
      appliedAt: daysAgo(5),
      events: [
        { to: "APPLIED", at: daysAgo(5) },
        { to: "WITHDRAWN", at: daysAgo(2) },
      ],
    });
    // A draft has not been sent and stays out entirely.
    await createApplication(userId, {
      status: "DRAFT",
      source: "RECRUITER",
      events: [{ to: "DRAFT", at: daysAgo(3) }],
    });
    await createApplication(strangerId, {
      status: "SCREENING",
      source: "JOB_BOARD",
      appliedAt: daysAgo(9),
      events: [
        { to: "APPLIED", at: daysAgo(9) },
        { to: "SCREENING", at: daysAgo(8) },
      ],
    });

    const rows = await responseBySource(userId);

    expect(rows).toEqual([
      { source: "JOB_BOARD", applied: 3, responded: 2, medianDaysToResponse: 7.5 },
      { source: "DIRECT", applied: 1, responded: 0, medianDaysToResponse: null },
    ]);
  });

  it("falls back to the move to applied when no date was entered, and never goes below zero", async () => {
    await createApplication(userId, {
      status: "INTERVIEW",
      source: "REFERRAL",
      events: [
        { to: "APPLIED", at: daysAgo(12) },
        { to: "INTERVIEW", at: daysAgo(9) },
      ],
    });
    // The entered date lies after the recorded answer.
    await createApplication(userId, {
      status: "SCREENING",
      source: "REFERRAL",
      appliedAt: daysAgo(8),
      events: [
        { to: "APPLIED", at: daysAgo(10) },
        { to: "SCREENING", at: daysAgo(9) },
      ],
    });

    const [referral] = await responseBySource(userId);

    expect(referral).toEqual({
      source: "REFERRAL",
      applied: 2,
      responded: 2,
      medianDaysToResponse: 1.5,
    });
  });

  it("uses the median, so one slow company does not drag the number away", async () => {
    for (const days of [2, 3, 100]) {
      await createApplication(userId, {
        status: "SCREENING",
        source: "JOB_BOARD",
        appliedAt: daysAgo(days + 1),
        events: [
          { to: "APPLIED", at: daysAgo(days + 1) },
          { to: "SCREENING", at: daysAgo(1) },
        ],
      });
    }

    const [jobBoard] = await responseBySource(userId);

    // The average would be 35.
    expect(jobBoard.medianDaysToResponse).toBe(3);
  });
});

describe("timeInStage", () => {
  it("averages finished stays per stage and leaves the current one out", async () => {
    await createApplication(userId, {
      status: "INTERVIEW",
      events: [
        { to: "DRAFT", at: daysAgo(20) },
        { to: "APPLIED", at: daysAgo(18) },
        { to: "SCREENING", at: daysAgo(12) },
        { to: "INTERVIEW", at: daysAgo(2) },
      ],
    });
    await createApplication(userId, {
      status: "REJECTED",
      events: [
        { to: "APPLIED", at: daysAgo(10) },
        { to: "REJECTED", at: daysAgo(6) },
      ],
    });
    await createApplication(strangerId, {
      status: "SCREENING",
      events: [
        { to: "APPLIED", at: daysAgo(100) },
        { to: "SCREENING", at: daysAgo(1) },
      ],
    });

    const stages = await timeInStage(userId);
    const byStage = Object.fromEntries(stages.map((row) => [row.stage, row]));

    expect(byStage.DRAFT).toEqual({ stage: "DRAFT", averageDays: 2, stays: 1 });
    expect(byStage.APPLIED).toEqual({ stage: "APPLIED", averageDays: 5, stays: 2 });
    expect(byStage.SCREENING).toEqual({ stage: "SCREENING", averageDays: 10, stays: 1 });
    expect(byStage.INTERVIEW).toBeUndefined();
  });
});

describe("quietApplications", () => {
  it("ranks open, sent applications by how long nothing has happened", async () => {
    await createApplication(userId, {
      status: "INTERVIEW",
      role: "Eight days",
      events: [
        { to: "APPLIED", at: daysAgo(20) },
        { to: "INTERVIEW", at: daysAgo(8) },
      ],
    });
    await createApplication(userId, {
      status: "APPLIED",
      role: "Twenty days",
      company: "Quiet Inc",
      events: [{ to: "APPLIED", at: daysAgo(20) }],
    });
    // Recent enough to leave alone.
    await createApplication(userId, {
      status: "SCREENING",
      role: "Three days",
      events: [{ to: "SCREENING", at: daysAgo(3) }],
    });
    // Closed, and a draft that has not been sent.
    await createApplication(userId, {
      status: "REJECTED",
      events: [{ to: "REJECTED", at: daysAgo(40) }],
    });
    await createApplication(userId, {
      status: "DRAFT",
      events: [{ to: "DRAFT", at: daysAgo(30) }],
    });
    await createApplication(strangerId, {
      status: "APPLIED",
      events: [{ to: "APPLIED", at: daysAgo(50) }],
    });

    const quiet = await quietApplications(userId, NOW);

    expect(quiet.map((row) => row.role)).toEqual(["Twenty days", "Eight days"]);
    expect(quiet[0]).toMatchObject({ company: "Quiet Inc", status: "APPLIED", daysQuiet: 20 });
    expect(quiet[1].daysQuiet).toBe(8);
  });

  it("shows ten at most", async () => {
    for (let index = 0; index < 12; index += 1) {
      await createApplication(userId, {
        status: "APPLIED",
        events: [{ to: "APPLIED", at: daysAgo(10 + index) }],
      });
    }

    expect(await quietApplications(userId, NOW)).toHaveLength(10);
  });
});
