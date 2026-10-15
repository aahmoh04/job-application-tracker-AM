import type { Source, Status } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/** Empties every table. User and Company cascade into everything else. */
export async function resetDatabase() {
  await prisma.$executeRaw`TRUNCATE "User", "Company" CASCADE`;
}

export function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: null }, select: { id: true } });
}

type ApplicationFixture = {
  status: Status;
  source?: Source;
  role?: string;
  company?: string;
  appliedAt?: Date | null;
  /** The status history in order. Each event starts where the previous one ended. */
  events: { to: Status; at: Date }[];
};

/** One application with its status history, written the way the app writes it. */
export async function createApplication(userId: string, fixture: ApplicationFixture) {
  const companyName = fixture.company ?? "Test Company";
  const company = await prisma.company.upsert({
    where: { name: companyName },
    update: {},
    create: { name: companyName },
    select: { id: true },
  });

  return prisma.application.create({
    data: {
      userId,
      companyId: company.id,
      role: fixture.role ?? "Developer",
      status: fixture.status,
      source: fixture.source ?? "DIRECT",
      appliedAt: fixture.appliedAt ?? null,
      statusEvents: {
        create: fixture.events.map((event, index) => ({
          from: index === 0 ? null : fixture.events[index - 1].to,
          to: event.to,
          createdAt: event.at,
        })),
      },
    },
    select: { id: true },
  });
}
