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
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

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
      email: "demo@example.com",
      // Null on purpose. Password hashing arrives in M02.
      passwordHash: null,
    },
  });

  const [northwind, kestrel, lumen, hafen] = await Promise.all([
    prisma.company.create({ data: { name: "Northwind Systems", website: "https://example.com" } }),
    prisma.company.create({ data: { name: "Kestrel Analytics", website: "https://example.org" } }),
    prisma.company.create({ data: { name: "Lumen Health", website: null } }),
    prisma.company.create({ data: { name: "Hafen Digital", website: "https://example.net" } }),
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
