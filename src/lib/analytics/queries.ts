import { Prisma } from "@/generated/prisma/client";
import type { Source, Status } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * The numbers behind the analytics page. Each function answers one question,
 * written above it, and does its counting in Postgres instead of loading rows
 * into JavaScript. With thirty applications either way works, with three
 * thousand only one of them still does.
 *
 * $queryRaw is justified here because these are aggregations Prisma's query
 * API cannot express, window functions and percentiles among them. The tagged
 * template still sends every value as a parameter, never as text inside the
 * SQL, so a user id cannot change the query. And like every read in the app,
 * each query puts the user id into its WHERE clause.
 *
 * The columns are timestamps without a time zone that hold UTC. "Now" is
 * handed in as epoch milliseconds and converted to UTC inside the SQL, so no
 * comparison depends on the time zone of the database session. Passing it in
 * at all keeps the queries testable against a fixed clock.
 */

/** How many weeks the weekly chart covers, the current one included. */
export const WEEKS_SHOWN = 12;

/** Silence shorter than this is normal and not worth a nudge. */
export const QUIET_AFTER_DAYS = 7;

function utc(moment: Date) {
  return Prisma.sql`(to_timestamp(${moment.getTime()}::float8 / 1000) AT TIME ZONE 'UTC')`;
}

export type WeekBucket = {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  open: number;
  accepted: number;
  rejected: number;
  /** Ended by the user, either withdrawn or an offer declined. */
  endedByMe: number;
};

/**
 * Do I apply steadily, and what became of each week's applications?
 *
 * Counts applications by the week of `appliedAt`, split by where they stand
 * now. Drafts without a date have not been sent and stay out. Weeks without
 * an application still appear with zeros, so gaps show as gaps.
 */
export async function applicationsPerWeek(userId: string, now: Date): Promise<WeekBucket[]> {
  return prisma.$queryRaw<WeekBucket[]>`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${utc(now)}) - ${WEEKS_SHOWN - 1}::int * interval '1 week',
        date_trunc('week', ${utc(now)}),
        interval '1 week'
      ) AS week
    )
    SELECT
      to_char(w.week, 'YYYY-MM-DD') AS week,
      count(a.id) FILTER (
        WHERE a.status NOT IN ('ACCEPTED', 'REJECTED', 'DECLINED', 'WITHDRAWN')
      )::int AS open,
      count(a.id) FILTER (WHERE a.status = 'ACCEPTED')::int AS accepted,
      count(a.id) FILTER (WHERE a.status = 'REJECTED')::int AS rejected,
      count(a.id) FILTER (WHERE a.status IN ('DECLINED', 'WITHDRAWN'))::int AS "endedByMe"
    FROM weeks w
    LEFT JOIN "Application" a
      ON a."userId" = ${userId}
      AND a."appliedAt" >= w.week
      AND a."appliedAt" < w.week + interval '1 week'
    GROUP BY w.week
    ORDER BY w.week
  `;
}

export type Funnel = {
  applied: number;
  screening: number;
  interview: number;
  offer: number;
};

/**
 * How far do my applications get?
 *
 * Counts every application that ever reached a stage, from the status
 * history rather than the current status. One that was rejected after the
 * interview still counts for applied, screening and interview. The stage an
 * application reached is the furthest one in its history, so one entered
 * straight as an interview counts for the stages before it as well. A
 * rejection implies the application was sent, an accepted or declined offer
 * implies the offer.
 */
export async function funnel(userId: string): Promise<Funnel> {
  const [row] = await prisma.$queryRaw<Funnel[]>`
    WITH reached AS (
      SELECT
        e."applicationId",
        max(
          CASE e."to"
            WHEN 'APPLIED' THEN 1
            WHEN 'REJECTED' THEN 1
            WHEN 'SCREENING' THEN 2
            WHEN 'INTERVIEW' THEN 3
            WHEN 'OFFER' THEN 4
            WHEN 'ACCEPTED' THEN 4
            WHEN 'DECLINED' THEN 4
            ELSE 0
          END
        ) AS stage
      FROM "StatusEvent" e
      JOIN "Application" a ON a.id = e."applicationId"
      WHERE a."userId" = ${userId}
      GROUP BY e."applicationId"
    )
    SELECT
      count(*) FILTER (WHERE stage >= 1)::int AS applied,
      count(*) FILTER (WHERE stage >= 2)::int AS screening,
      count(*) FILTER (WHERE stage >= 3)::int AS interview,
      count(*) FILTER (WHERE stage >= 4)::int AS offer
    FROM reached
  `;

  return row;
}

export type SourceResponse = {
  source: Source;
  applied: number;
  responded: number;
  /** Null when nothing from this source has had an answer yet. */
  medianDaysToResponse: number | null;
};

/**
 * Which channel gets me answers at all, and how fast?
 *
 * An answer is the first move the company makes, into screening, interview,
 * offer or a rejection. Withdrawing is my own move and does not count. The
 * clock starts at `appliedAt`, or at the move to applied when no date was
 * entered. The median rather than the average, because one company that
 * answers after four months would drag an average far away from the usual
 * case. An answer recorded before the entered date counts as zero days. The
 * most used channel comes first.
 */
export async function responseBySource(userId: string): Promise<SourceResponse[]> {
  return prisma.$queryRaw<SourceResponse[]>`
    WITH per_application AS (
      SELECT
        a.source,
        COALESCE(
          a."appliedAt",
          min(e."createdAt") FILTER (WHERE e."to" = 'APPLIED')
        ) AS applied_at,
        min(e."createdAt") FILTER (
          WHERE e."to" IN ('SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED')
        ) AS answered_at
      FROM "Application" a
      LEFT JOIN "StatusEvent" e ON e."applicationId" = a.id
      WHERE a."userId" = ${userId}
      GROUP BY a.id
    )
    SELECT
      source::text AS source,
      count(*)::int AS applied,
      count(answered_at)::int AS responded,
      (
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY CASE
            WHEN answered_at IS NOT NULL
            THEN GREATEST(0, extract(epoch FROM answered_at - applied_at) / 86400)::float8
          END
        )
      )::float8 AS "medianDaysToResponse"
    FROM per_application
    WHERE applied_at IS NOT NULL
    GROUP BY source
    ORDER BY applied DESC, source
  `;
}

export type StageDuration = {
  stage: Status;
  averageDays: number;
  /** How many finished stays the average is based on. */
  stays: number;
};

/**
 * Where do my applications sit the longest?
 *
 * Every status event closes the stay in the status it came `from`, and LAG
 * looks one event back to see when that stay began. Only stays that have
 * ended count. An application still sitting in a stage has no final number
 * yet, and counting it up to today would mix finished and unfinished stays.
 */
export async function timeInStage(userId: string): Promise<StageDuration[]> {
  return prisma.$queryRaw<StageDuration[]>`
    WITH stays AS (
      SELECT
        e."from" AS stage,
        extract(
          epoch FROM e."createdAt" - lag(e."createdAt") OVER (
            PARTITION BY e."applicationId"
            ORDER BY e."createdAt", e.id
          )
        ) / 86400 AS days
      FROM "StatusEvent" e
      JOIN "Application" a ON a.id = e."applicationId"
      WHERE a."userId" = ${userId}
    )
    SELECT
      stage::text AS stage,
      avg(days)::float8 AS "averageDays",
      count(*)::int AS stays
    FROM stays
    WHERE stage IS NOT NULL AND days IS NOT NULL
    GROUP BY stage
  `;
}

export type QuietApplication = {
  id: string;
  role: string;
  company: string;
  status: Status;
  daysQuiet: number;
};

/**
 * Where should I follow up?
 *
 * Applications that are out there and waiting, ranked by how long nothing has
 * happened since their last status event. Drafts are not waiting on anyone,
 * closed ones are over. Ten at most, the page is a nudge and not an archive.
 */
export async function quietApplications(userId: string, now: Date): Promise<QuietApplication[]> {
  return prisma.$queryRaw<QuietApplication[]>`
    SELECT
      a.id,
      a.role,
      c.name AS company,
      a.status::text AS status,
      (extract(epoch FROM ${utc(now)} - max(e."createdAt")) / 86400)::float8 AS "daysQuiet"
    FROM "Application" a
    JOIN "Company" c ON c.id = a."companyId"
    JOIN "StatusEvent" e ON e."applicationId" = a.id
    WHERE a."userId" = ${userId}
      AND a.status IN ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER')
    GROUP BY a.id, c.name
    HAVING max(e."createdAt") <= ${utc(now)} - ${QUIET_AFTER_DAYS}::int * interval '1 day'
    ORDER BY "daysQuiet" DESC
    LIMIT 10
  `;
}
