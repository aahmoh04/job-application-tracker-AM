import { cached } from "@/lib/cache";
import {
  applicationsPerWeek,
  funnel,
  quietApplications,
  responseBySource,
  timeInStage,
  type Funnel,
  type QuietApplication,
  type SourceResponse,
  type StageDuration,
  type WeekBucket,
} from "./queries";

/**
 * The analytics page reads its numbers through the per-user cache in
 * src/lib/cache.ts. Every write to an application invalidates it, see
 * src/lib/applications/actions.ts, so a change shows on the next visit.
 *
 * With a few dozen applications the five queries take milliseconds, so the
 * cache saves nothing anyone would notice. It is here to build the pattern
 * once and get its hard part right, which is the invalidation.
 */

/**
 * Writes invalidate at once, so the expiry only covers what no write touches,
 * the clock. The weekly chart and the quiet list depend on "now", and a cached
 * page can be up to five minutes behind it. Both count in whole days and
 * weeks, so that only shows right at a boundary, when a quiet application
 * reaches its next day or a new week begins.
 */
const TTL_MS = 5 * 60_000;

// Part of the key. Bump the number whenever the shape of Analytics changes, so
// a new deployment never reads an entry the previous one wrote.
const CACHE_NAME = "analytics:v1";

export type Analytics = {
  weeks: WeekBucket[];
  funnel: Funnel;
  sources: SourceResponse[];
  durations: StageDuration[];
  quiet: QuietApplication[];
};

export function getAnalytics(userId: string, now: Date): Promise<Analytics> {
  return cached(userId, CACHE_NAME, TTL_MS, async () => {
    // Independent questions, so they go to the database at the same time, and
    // with one clock, so the weekly chart and the quiet list agree on "now".
    const [weeks, stages, sources, durations, quiet] = await Promise.all([
      applicationsPerWeek(userId, now),
      funnel(userId),
      responseBySource(userId),
      timeInStage(userId),
      quietApplications(userId, now),
    ]);

    return { weeks, funnel: stages, sources, durations, quiet };
  });
}
