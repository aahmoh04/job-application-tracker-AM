/**
 * Development seed data.
 *
 * Run with:  npx prisma db seed
 *
 * The script wipes the database first, so it can be run as often as you like
 * and always produces the same result.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * The demo account. Its password is printed in the README, which is fine for
 * a local database and nothing else. The seed wipes every table before it
 * writes, so it never belongs anywhere near data that matters anyway.
 */
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

/** Helper: a date n days before now. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Helper: a date n days after now. */
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  // Deleting the user cascades into applications, and those cascade further
  // into status events and contacts. Companies use onDelete: Restrict, so they
  // can only go once nothing points at them any more.
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      // Hashed exactly like a real sign-up, so signing in as the demo user
      // takes the normal path through the app.
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
  });

  const [northwind, kestrel, lumen, hafen, brightwater, orbit, pixelhafen] = await Promise.all([
    prisma.company.create({ data: { name: "Northwind Systems", website: "https://example.com" } }),
    prisma.company.create({ data: { name: "Kestrel Analytics", website: "https://example.org" } }),
    prisma.company.create({ data: { name: "Lumen Health", website: null } }),
    prisma.company.create({ data: { name: "Hafen Digital", website: "https://example.net" } }),
    prisma.company.create({ data: { name: "Brightwater Labs", website: null } }),
    prisma.company.create({ data: { name: "Orbit Freight", website: "https://example.com" } }),
    prisma.company.create({ data: { name: "Pixelhafen Studio", website: null } }),
  ]);

  // A nested write. One call creates the application, its status history and
  // its contacts in a single transaction.
  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: northwind.id,
      role: "Junior Software Developer",
      status: "INTERVIEW",
      source: "JOB_BOARD",
      salaryMin: 45000,
      salaryMax: 55000,
      postingUrl: "https://example.com/jobs/junior-dev",
      appliedAt: daysAgo(24),
      followUpAt: daysFromNow(3),
      notes: "Second round scheduled. Ask about the migration off the legacy service.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(26) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(24) },
          {
            from: "APPLIED",
            to: "SCREENING",
            note: "Recruiter call, 20 min",
            createdAt: daysAgo(17),
          },
          { from: "SCREENING", to: "INTERVIEW", createdAt: daysAgo(6) },
        ],
      },
      contacts: {
        create: [
          { name: "Anna Berger", email: "a.berger@example.com", role: "Talent Acquisition" },
          { name: "Tim Kohl", email: null, role: "Engineering Lead" },
        ],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: kestrel.id,
      role: "AI Engineer (Junior)",
      status: "REJECTED",
      source: "DIRECT",
      appliedAt: daysAgo(41),
      notes: "No reason given.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(43) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(41) },
          { from: "APPLIED", to: "SCREENING", createdAt: daysAgo(33) },
          {
            from: "SCREENING",
            to: "REJECTED",
            note: "Standard rejection mail",
            createdAt: daysAgo(20),
          },
        ],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: lumen.id,
      role: "Fullstack Developer",
      status: "APPLIED",
      source: "REFERRAL",
      salaryMin: 48000,
      appliedAt: daysAgo(9),
      followUpAt: daysAgo(2), // overdue on purpose, M07 will pick this up
      notes: "Referred by a former colleague.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(11) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(9) },
        ],
      },
      contacts: {
        create: [{ name: "Marek Sowa", email: "marek@example.org", role: "Referral" }],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: hafen.id,
      role: "Backend Developer (Python)",
      status: "DRAFT",
      source: "RECRUITER",
      postingUrl: "https://example.net/careers/backend",
      statusEvents: {
        create: [{ from: null, to: "DRAFT" }],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: brightwater.id,
      role: "Data Engineer",
      status: "SCREENING",
      source: "JOB_BOARD",
      salaryMin: 50000,
      salaryMax: 58000,
      appliedAt: daysAgo(12),
      followUpAt: daysFromNow(2),
      notes: "Take-home task announced for next week.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(14) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(12) },
          { from: "APPLIED", to: "SCREENING", note: "Phone screen", createdAt: daysAgo(4) },
        ],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: orbit.id,
      role: "Software Engineer, Platform",
      status: "OFFER",
      source: "REFERRAL",
      salaryMin: 58000,
      salaryMax: 64000,
      appliedAt: daysAgo(35),
      followUpAt: daysFromNow(1),
      notes: "Offer valid until Friday. Compare with Northwind before answering.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(36) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(35) },
          { from: "APPLIED", to: "SCREENING", createdAt: daysAgo(28) },
          { from: "SCREENING", to: "INTERVIEW", createdAt: daysAgo(19) },
          {
            from: "INTERVIEW",
            to: "OFFER",
            note: "Verbal offer, written one follows",
            createdAt: daysAgo(2),
          },
        ],
      },
    },
  });

  await prisma.application.create({
    data: {
      userId: user.id,
      companyId: pixelhafen.id,
      role: "Frontend Developer (React)",
      status: "WITHDRAWN",
      source: "DIRECT",
      appliedAt: daysAgo(30),
      // Long past, on purpose. A closed application never counts as a due
      // follow-up, so this one must not show up on the dashboard.
      followUpAt: daysAgo(15),
      notes: "Withdrew before the first interview, the role turned out to be mostly maintenance.",
      statusEvents: {
        create: [
          { from: null, to: "DRAFT", createdAt: daysAgo(31) },
          { from: "DRAFT", to: "APPLIED", createdAt: daysAgo(30) },
          { from: "APPLIED", to: "WITHDRAWN", createdAt: daysAgo(16) },
        ],
      },
    },
  });

  const [users, companies, applications, events, contacts] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.application.count(),
    prisma.statusEvent.count(),
    prisma.contact.count(),
  ]);

  console.log("Seed complete:");
  console.log(`  users         ${users}`);
  console.log(`  companies     ${companies}`);
  console.log(`  applications  ${applications}`);
  console.log(`  status events ${events}`);
  console.log(`  contacts      ${contacts}`);
  console.log(`Sign in with ${DEMO_EMAIL} and ${DEMO_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
