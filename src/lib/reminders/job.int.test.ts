import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Status } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Mail } from "@/lib/mail/send";
import { createApplication, createUser, resetDatabase } from "@/test/database";
import { freshAddress, inbox, message } from "@/test/mailpit";
import { sendDueReminders } from "./job";

// The time the daily cron runs, 05:00 UTC.
const NOW = new Date("2026-10-29T05:00:00Z");

/** Midnight UTC, `offset` days from NOW, the way a date input is stored. */
function day(offset: number) {
  return new Date(Date.UTC(2026, 9, 29 + offset));
}

/** A sender that keeps what it was given instead of sending it. */
function outbox() {
  const sent: Mail[] = [];
  return {
    sent,
    send: async (mail: Mail) => {
      sent.push(mail);
    },
  };
}

type FollowUp = { role?: string; company?: string; status?: Status };

async function followUp(userId: string, followUpAt: Date | null, extra: FollowUp = {}) {
  const status = extra.status ?? "APPLIED";
  const events: { to: Status; at: Date }[] = [{ to: "APPLIED", at: day(-20) }];

  if (status !== "APPLIED") {
    events.push({ to: status, at: day(-2) });
  }

  const application = await createApplication(userId, {
    status,
    role: extra.role,
    company: extra.company,
    followUpAt,
    events,
  });

  return application.id;
}

async function reminderSentAt(id: string) {
  const application = await prisma.application.findUniqueOrThrow({ where: { id } });
  return application.reminderSentAt;
}

let me: string;
let myAddress: string;

beforeEach(async () => {
  await resetDatabase();
  myAddress = freshAddress("me");
  me = (await createUser(myAddress, { verified: true })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("sendDueReminders", () => {
  it("sends each user one mail with every follow-up that came due", async () => {
    await followUp(me, day(0), { role: "Due today" });
    await followUp(me, day(-3), { role: "Due three days ago" });
    await followUp(me, day(1), { role: "Due tomorrow" });
    await followUp(me, day(-1), { role: "Rejected meanwhile", status: "REJECTED" });
    await followUp(me, null, { role: "No follow-up date" });
    const strangerAddress = freshAddress("stranger");
    const stranger = (await createUser(strangerAddress, { verified: true })).id;
    await followUp(stranger, day(-1), { role: "Their follow-up" });

    const { sent, send } = outbox();

    expect(await sendDueReminders(NOW, send)).toEqual({ users: 2, mails: 2, failed: 0 });

    const mine = sent.find((mail) => mail.to === myAddress);
    expect(mine?.subject).toBe("Time to follow up on 2 applications");
    // The longest overdue comes first.
    expect(mine?.text.indexOf("Due three days ago")).toBeLessThan(
      mine?.text.indexOf("Due today") ?? -1,
    );

    for (const notDue of ["Due tomorrow", "Rejected meanwhile", "No follow-up date"]) {
      expect(mine?.text).not.toContain(notDue);
    }

    expect(mine?.text).not.toContain("Their follow-up");
    expect(sent.find((mail) => mail.to === strangerAddress)?.text).toContain("Their follow-up");
  });

  it("only writes to addresses someone has proven to own", async () => {
    const unconfirmed = (await createUser(freshAddress("unconfirmed"))).id;
    const theirs = await followUp(unconfirmed, day(-1));
    const { sent, send } = outbox();

    expect(await sendDueReminders(NOW, send)).toEqual({ users: 0, mails: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    // Still waiting, so the reminder goes out once the address is confirmed.
    expect(await reminderSentAt(theirs)).toBeNull();
  });

  it("sends nothing the second time", async () => {
    await followUp(me, day(-1));
    const { sent, send } = outbox();

    await sendDueReminders(NOW, send);
    const second = await sendDueReminders(new Date(NOW.getTime() + 60_000), send);

    expect(second).toEqual({ users: 0, mails: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("lets only one of two simultaneous runs send", async () => {
    await followUp(me, day(-1));

    // The first run claims and then hangs in the middle of sending. The second
    // run starts in exactly that moment, which a real double trigger only
    // hits by luck.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sending!: () => void;
    const started = new Promise<void>((resolve) => {
      sending = resolve;
    });

    const first = outbox();
    const slow = sendDueReminders(NOW, async (mail) => {
      sending();
      await held;
      await first.send(mail);
    });

    await started;
    const second = outbox();
    const fast = await sendDueReminders(NOW, second.send);
    release();

    expect(fast).toEqual({ users: 0, mails: 0, failed: 0 });
    expect(await slow).toEqual({ users: 1, mails: 1, failed: 0 });
    expect(first.sent.length + second.sent.length).toBe(1);
  });

  it("gives the follow-ups back when sending fails, and the next run sends them", async () => {
    const id = await followUp(me, day(-1));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const failing = async () => {
        throw new Error("The mail provider is down");
      };

      expect(await sendDueReminders(NOW, failing)).toEqual({ users: 1, mails: 0, failed: 1 });
      expect(await reminderSentAt(id)).toBeNull();
    } finally {
      errors.mockRestore();
    }

    const { sent, send } = outbox();

    expect(await sendDueReminders(NOW, send)).toEqual({ users: 1, mails: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(await reminderSentAt(id)).toEqual(NOW);
  });

  it("delivers to the real test inbox when no sender is passed in", async () => {
    const id = await followUp(me, day(-1), { role: "Platform Engineer", company: "Orbit Freight" });

    expect(await sendDueReminders(NOW)).toEqual({ users: 1, mails: 1, failed: 0 });

    const delivered = await inbox(myAddress);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].Subject).toBe("Time to follow up with Orbit Freight");

    const mail = await message(delivered[0].ID);
    expect(mail.HTML).toContain(`href="http://localhost:3000/applications/${id}"`);
    expect(mail.Text).toContain("Platform Engineer at Orbit Freight");
  });
});
