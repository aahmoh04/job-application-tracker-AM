import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createApplication, resetDatabase } from "@/test/database";
import { platformNumbers } from "./queries";

// A fixed clock, a Wednesday at noon.
const NOW = new Date("2026-10-21T12:00:00Z");
const DAY = 86_400_000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY);
}

// Content no admin may ever see. Each one is planted in the fixture below.
const CONTENT = [
  "secret-me@example.com",
  "Secret Role",
  "Secret Company",
  "secret note",
  "https://secret.example/job",
];

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function platform() {
  // An account with a password, joined three months ago, moved an application
  // two days ago.
  const me = await prisma.user.create({
    data: { email: "secret-me@example.com", passwordHash: "x", createdAt: daysAgo(90) },
  });
  const mine = await createApplication(me.id, {
    status: "INTERVIEW",
    role: "Secret Role",
    company: "Secret Company",
    events: [
      { to: "APPLIED", at: daysAgo(20) },
      { to: "INTERVIEW", at: daysAgo(2) },
    ],
  });
  await prisma.application.update({
    where: { id: mine.id },
    data: { notes: "secret note", postingUrl: "https://secret.example/job" },
  });

  // A GitHub-only account from last week that has tracked nothing yet.
  await prisma.user.create({
    data: {
      email: "github@example.com",
      passwordHash: null,
      createdAt: daysAgo(5),
      accounts: { create: { provider: "github", providerAccountId: "4242" } },
    },
  });

  // An admin who has been quiet for ten days.
  const admin = await prisma.user.create({
    data: { email: "admin@example.com", passwordHash: "x", role: "ADMIN", createdAt: daysAgo(40) },
  });
  await createApplication(admin.id, {
    status: "REJECTED",
    events: [
      { to: "APPLIED", at: daysAgo(30) },
      { to: "REJECTED", at: daysAgo(10) },
    ],
  });
}

describe("platformNumbers", () => {
  it("counts accounts and applications across the whole platform", async () => {
    await platform();

    expect(await platformNumbers(NOW)).toEqual({
      accounts: { total: 3, joinedRecently: 1, active: 1, admins: 1, withPassword: 2 },
      applications: {
        total: 2,
        byStatus: [
          { status: "DRAFT", count: 0 },
          { status: "APPLIED", count: 0 },
          { status: "SCREENING", count: 0 },
          { status: "INTERVIEW", count: 1 },
          { status: "OFFER", count: 0 },
          { status: "ACCEPTED", count: 0 },
          { status: "REJECTED", count: 1 },
          { status: "DECLINED", count: 0 },
          { status: "WITHDRAWN", count: 0 },
        ],
      },
    });
  });

  it("holds no content of any account, and no id that would lead to one", async () => {
    await platform();

    const answer = JSON.stringify(await platformNumbers(NOW));

    for (const content of CONTENT) {
      expect(answer).not.toContain(content);
    }

    const ids = [
      ...(await prisma.user.findMany({ select: { id: true } })),
      ...(await prisma.application.findMany({ select: { id: true } })),
    ];

    for (const { id } of ids) {
      expect(answer).not.toContain(id);
    }
  });

  it("answers with zeros on an empty platform", async () => {
    const numbers = await platformNumbers(NOW);

    expect(numbers.accounts).toEqual({
      total: 0,
      joinedRecently: 0,
      active: 0,
      admins: 0,
      withPassword: 0,
    });
    expect(numbers.applications.byStatus.every((row) => row.count === 0)).toBe(true);
  });
});
