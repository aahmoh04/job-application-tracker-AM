import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalytics } from "@/lib/analytics/cached";
import { SESSION_ENDED_PATH } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { closeRedis } from "@/lib/redis";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import { form, redirectTarget } from "@/test/next";
import { resetRedis } from "@/test/redis";
import {
  advanceStatus,
  createApplication as createApplicationAction,
  deleteApplication,
  moveApplication,
  updateApplication,
} from "./actions";

// Stand-ins for the parts that need a running Next request. The signed-in
// user comes from here, and revalidatePath has no cache to clear. The rules,
// the queries, the database and the Redis cache are real.
const request = vi.hoisted(() => ({ session: null as SessionPayload | null }));

vi.mock("@/lib/auth/cookies", () => ({
  getSession: async () => request.session,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const DAY = 86_400_000;

let me: string;
let stranger: string;

/** What the edit form posts, with everything a browser would send. */
function applicationForm(overrides: Record<string, string> = {}) {
  return form({
    companyName: "Northwind Systems",
    role: "Junior Developer",
    status: "DRAFT",
    source: "JOB_BOARD",
    salaryMin: "",
    salaryMax: "",
    postingUrl: "",
    notes: "",
    appliedAt: "",
    followUpAt: "",
    ...overrides,
  });
}

/** Polls until the condition holds, or fails after three seconds. */
async function waitUntil(condition: () => Promise<boolean>) {
  const deadline = Date.now() + 3_000;

  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Waits until at least this many queries are queued behind a lock. */
async function waitForLockWaiters(blocker: Client, count: number) {
  // Inside a transaction Postgres freezes pg_stat_activity at the first look,
  // so the snapshot has to be cleared before every check.
  await waitUntil(async () => {
    await blocker.query("SELECT pg_stat_clear_snapshot()");
    const { rows } = await blocker.query(
      "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    return rows[0].waiting >= count;
  });
}

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  me = (await createUser("me@example.com")).id;
  stranger = (await createUser("stranger@example.com")).id;
  request.session = { userId: me };
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

describe("creating", () => {
  it("files the application under the signed-in user, with its first history entry", async () => {
    const target = await redirectTarget(
      createApplicationAction({}, applicationForm({ salaryMin: "45.000", status: "APPLIED" })),
    );

    const application = await prisma.application.findFirstOrThrow({
      include: { statusEvents: true, company: true },
    });

    expect(target).toBe(`/applications/${application.id}`);
    expect(application.userId).toBe(me);
    expect(application.salaryMin).toBe(45000);
    expect(application.company.name).toBe("Northwind Systems");
    expect(application.statusEvents).toMatchObject([{ from: null, to: "APPLIED" }]);
  });

  it("sends a signed-out visitor to the sign-in page and writes nothing", async () => {
    request.session = null;

    const target = await redirectTarget(createApplicationAction({}, applicationForm()));

    expect(target).toBe("/sign-in");
    expect(await prisma.application.count()).toBe(0);
  });
});

describe("someone else's application", () => {
  let theirs: string;

  beforeEach(async () => {
    theirs = (
      await createApplication(stranger, {
        status: "APPLIED",
        role: "Their role",
        events: [{ to: "APPLIED", at: new Date(Date.now() - DAY) }],
      })
    ).id;
  });

  async function unchanged() {
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: theirs },
      include: { statusEvents: true },
    });

    expect(application).toMatchObject({ userId: stranger, role: "Their role", status: "APPLIED" });
    expect(application.statusEvents).toHaveLength(1);
  }

  it("cannot be edited", async () => {
    const target = await redirectTarget(
      updateApplication(theirs, {}, applicationForm({ role: "Mine now", status: "APPLIED" })),
    );

    expect(target).toBe("/applications");
    await unchanged();
  });

  it("cannot be deleted", async () => {
    const target = await redirectTarget(deleteApplication(theirs));

    expect(target).toBe("/applications");
    await unchanged();
  });

  it("cannot be moved, and the answer is the same as for an id that does not exist", async () => {
    const foreign = await moveApplication(theirs, "SCREENING");
    const missing = await moveApplication("does-not-exist", "SCREENING");

    expect(foreign).toEqual({ ok: false, message: "That application no longer exists." });
    expect(missing).toEqual(foreign);
    await unchanged();
  });

  it("cannot be reached through an id that arrives as an object", async () => {
    // A bound argument is decoded from JSON, and Prisma would read this as a
    // filter matching every application. The action parses it first.
    const target = await redirectTarget(deleteApplication({ not: "" } as unknown as string));

    expect(target).toBe("/applications");
    await unchanged();
  });
});

describe("a session whose account is gone", () => {
  // The token is still valid for days, but the account behind it was deleted.
  // Every action has to notice that through the guard, send the session off to
  // have its cookie cleared and write nothing. Each test fails as soon as its
  // action trusts the token alone.
  let mine: string;

  beforeEach(async () => {
    mine = (
      await createApplication(me, {
        status: "APPLIED",
        events: [{ to: "APPLIED", at: new Date(Date.now() - DAY) }],
      })
    ).id;
    request.session = { userId: "an-account-that-was-deleted" };
  });

  async function snapshot() {
    return {
      applications: await prisma.application.count(),
      events: await prisma.statusEvent.count(),
      mine: await prisma.application.findUniqueOrThrow({
        where: { id: mine },
        select: { role: true, status: true },
      }),
    };
  }

  it("cannot create", async () => {
    const before = await snapshot();

    expect(
      await redirectTarget(createApplicationAction({}, applicationForm({ status: "APPLIED" }))),
    ).toBe(SESSION_ENDED_PATH);
    expect(await snapshot()).toEqual(before);
  });

  it("cannot edit", async () => {
    const before = await snapshot();

    expect(
      await redirectTarget(
        updateApplication(mine, {}, applicationForm({ role: "Changed", status: "APPLIED" })),
      ),
    ).toBe(SESSION_ENDED_PATH);
    expect(await snapshot()).toEqual(before);
  });

  it("cannot delete", async () => {
    const before = await snapshot();

    expect(await redirectTarget(deleteApplication(mine))).toBe(SESSION_ENDED_PATH);
    expect(await snapshot()).toEqual(before);
  });

  it("cannot advance a status from the detail page", async () => {
    const before = await snapshot();

    expect(await redirectTarget(advanceStatus(mine, "SCREENING"))).toBe(SESSION_ENDED_PATH);
    expect(await snapshot()).toEqual(before);
  });

  it("cannot move a card on the board", async () => {
    const before = await snapshot();

    expect(await redirectTarget(moveApplication(mine, "SCREENING"))).toBe(SESSION_ENDED_PATH);
    expect(await snapshot()).toEqual(before);
  });
});

describe("moving my own application", () => {
  let mine: string;

  beforeEach(async () => {
    mine = (
      await createApplication(me, {
        status: "APPLIED",
        events: [{ to: "APPLIED", at: new Date(Date.now() - DAY) }],
      })
    ).id;
  });

  it("writes the new status and its history entry together", async () => {
    expect(await moveApplication(mine, "SCREENING")).toEqual({ ok: true });

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: mine },
      include: { statusEvents: { orderBy: { createdAt: "asc" } } },
    });

    expect(application.status).toBe("SCREENING");
    expect(application.statusEvents.at(-1)).toMatchObject({ from: "APPLIED", to: "SCREENING" });
  });

  it("refuses a move the pipeline does not allow", async () => {
    const result = await moveApplication(mine, "ACCEPTED");

    expect(result.ok).toBe(false);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: mine } })).status).toBe(
      "APPLIED",
    );
  });

  it("lets only one of two moves through when both read the same status", async () => {
    // A third connection locks the row. Reads are not blocked by that, so both
    // moves read APPLIED, and then both queue up behind the lock with their
    // write. That forces the interleaving a real race only hits by luck.
    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "Application" WHERE id = $1 FOR UPDATE', [mine]);

    // Both moves are legal from APPLIED and both end the application.
    const moves = Promise.all([
      moveApplication(mine, "REJECTED"),
      moveApplication(mine, "WITHDRAWN"),
    ]);

    // Two writes waiting for the lock means both reads are done.
    await waitForLockWaiters(blocker, 2);

    await blocker.query("COMMIT");
    await blocker.end();

    const results = await moves;
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: mine },
      include: { statusEvents: true },
    });

    // The first write wins. The second finds the row no longer APPLIED, and
    // with the status in its where clause it matches nothing.
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(application.statusEvents).toHaveLength(2);
    expect(["REJECTED", "WITHDRAWN"]).toContain(application.status);
  });
});

describe("the cached analytics", () => {
  // Each test reads the analytics once before the write, which fills the
  // cache. The read after the write only sees the change if the action
  // invalidated the cache.
  async function analytics() {
    return getAnalytics(me, new Date());
  }

  it("count a new application right away", async () => {
    expect((await analytics()).funnel.applied).toBe(0);

    await redirectTarget(createApplicationAction({}, applicationForm({ status: "APPLIED" })));

    expect((await analytics()).funnel.applied).toBe(1);
  });

  describe("with an application", () => {
    let mine: string;

    beforeEach(async () => {
      mine = (
        await createApplication(me, {
          status: "APPLIED",
          source: "JOB_BOARD",
          events: [{ to: "APPLIED", at: new Date(Date.now() - DAY) }],
        })
      ).id;
    });

    it("follow an edit that only changes the source", async () => {
      expect((await analytics()).sources.map((row) => row.source)).toEqual(["JOB_BOARD"]);

      await redirectTarget(
        updateApplication(mine, {}, applicationForm({ status: "APPLIED", source: "REFERRAL" })),
      );

      expect((await analytics()).sources.map((row) => row.source)).toEqual(["REFERRAL"]);
    });

    it("follow a move on the board", async () => {
      expect((await analytics()).funnel.screening).toBe(0);

      expect(await moveApplication(mine, "SCREENING")).toEqual({ ok: true });

      expect((await analytics()).funnel.screening).toBe(1);
    });

    it("never keep the numbers from before a move that was still being written", async () => {
      // The lock from the race test above holds the move after its read, with
      // its write waiting. A page view runs in exactly that moment and caches
      // what it sees, the old state. Had the move invalidated before writing,
      // that old state would now sit under the new version.
      const blocker = new Client({ connectionString: process.env.DATABASE_URL });
      await blocker.connect();
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM "Application" WHERE id = $1 FOR UPDATE', [mine]);

      const move = moveApplication(mine, "SCREENING");
      await waitForLockWaiters(blocker, 1);

      expect((await analytics()).funnel.screening).toBe(0);

      await blocker.query("COMMIT");
      await blocker.end();

      expect(await move).toEqual({ ok: true });
      expect((await analytics()).funnel.screening).toBe(1);
    });

    it("drop a deleted application", async () => {
      expect((await analytics()).funnel.applied).toBe(1);

      await redirectTarget(deleteApplication(mine));

      expect((await analytics()).funnel.applied).toBe(0);
    });
  });
});
