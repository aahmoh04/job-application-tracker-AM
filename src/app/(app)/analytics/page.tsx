import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  QUIET_AFTER_DAYS,
  WEEKS_SHOWN,
  applicationsPerWeek,
  funnel,
  quietApplications,
  responseBySource,
  timeInStage,
} from "@/lib/analytics/queries";
import { getSession } from "@/lib/auth/cookies";
import {
  FunnelChart,
  QuietList,
  Section,
  SourceTable,
  StageDurations,
  WeeklyChart,
} from "./sections";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  // One clock for the whole page, so the weekly chart and the quiet list agree
  // on what "now" is.
  const now = new Date();

  // Independent questions, so they go to the database at the same time.
  const [weeks, stages, sources, durations, quiet] = await Promise.all([
    applicationsPerWeek(session.userId, now),
    funnel(session.userId),
    responseBySource(session.userId),
    timeInStage(session.userId),
    quietApplications(session.userId, now),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Five questions about your search, answered from your applications and their history.
        </p>
      </div>

      <Section
        title="Do I apply steadily?"
        description={`Applications per week over the last ${WEEKS_SHOWN} weeks, by the date they were sent, split by where they stand now.`}
      >
        <WeeklyChart weeks={weeks} />
      </Section>

      <Section
        title="How far do my applications get?"
        description="How many reached each stage at some point. An application rejected after the interview still counts for the interview."
      >
        <FunnelChart funnel={stages} />
      </Section>

      <Section
        title="Which channel gets answers?"
        description="An answer is the first move the company makes. The median, because one company that takes four months would pull an average far away from the usual case."
      >
        <SourceTable rows={sources} />
      </Section>

      <Section
        title="Where do applications sit the longest?"
        description="Average days in each stage, counted only for stays that have ended."
      >
        <StageDurations rows={durations} />
      </Section>

      <Section
        title="Where should I follow up?"
        description={`Open applications where nothing has happened for at least ${QUIET_AFTER_DAYS} days, the longest silence first.`}
      >
        <QuietList rows={quiet} />
      </Section>
    </main>
  );
}
