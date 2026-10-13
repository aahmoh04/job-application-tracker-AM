import { describe, expect, it } from "vitest";
import { Status } from "@/generated/prisma/enums";
import { isTerminal } from "@/lib/pipeline/transitions";
import { followUpDueFilter, isFollowUpDue } from "./follow-up";

const now = new Date("2026-10-13T12:00:00Z");
const yesterday = new Date("2026-10-12T12:00:00Z");
const tomorrow = new Date("2026-10-14T12:00:00Z");

describe("isFollowUpDue", () => {
  it("is due once the date has passed on an open application", () => {
    expect(isFollowUpDue({ status: "APPLIED", followUpAt: yesterday }, now)).toBe(true);
  });

  it("is not due before the date, or without one", () => {
    expect(isFollowUpDue({ status: "APPLIED", followUpAt: tomorrow }, now)).toBe(false);
    expect(isFollowUpDue({ status: "APPLIED", followUpAt: null }, now)).toBe(false);
  });

  it("is never due on a closed application, however old the date", () => {
    for (const status of Object.values(Status).filter(isTerminal)) {
      expect(isFollowUpDue({ status, followUpAt: yesterday }, now)).toBe(false);
    }
  });
});

describe("followUpDueFilter", () => {
  it("counts exactly the statuses that isFollowUpDue treats as open", () => {
    const { status } = followUpDueFilter(now);

    for (const candidate of Object.values(Status)) {
      expect(status.in.includes(candidate)).toBe(
        isFollowUpDue({ status: candidate, followUpAt: yesterday }, now),
      );
    }
  });
});
