import { describe, expect, it } from "vitest";
import { Status } from "@/generated/prisma/enums";
import { TRANSITIONS, canTransition, isTerminal, nextStatuses } from "./transitions";

const ALL_STATUSES = Object.values(Status);

const ACTIVE = ["DRAFT", "APPLIED", "SCREENING", "INTERVIEW", "OFFER"] as const;
const TERMINAL = ["ACCEPTED", "REJECTED", "DECLINED", "WITHDRAWN"] as const;

describe("the transition table", () => {
  it("has an entry for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(TRANSITIONS).toHaveProperty(status);
    }
  });

  it("never points at a status that does not exist", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it("never lets a status lead back to itself", () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });
});

describe("the happy path", () => {
  it("walks from draft to accepted one step at a time", () => {
    const path = ["DRAFT", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "ACCEPTED"] as const;

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("does not allow skipping a step", () => {
    expect(canTransition("DRAFT", "ACCEPTED")).toBe(false);
    expect(canTransition("DRAFT", "INTERVIEW")).toBe(false);
    expect(canTransition("APPLIED", "OFFER")).toBe(false);
  });

  it("does not allow walking backwards", () => {
    expect(canTransition("INTERVIEW", "APPLIED")).toBe(false);
    expect(canTransition("OFFER", "SCREENING")).toBe(false);
  });
});

describe("withdrawing", () => {
  it("is possible from every active status", () => {
    for (const status of ACTIVE) {
      expect(canTransition(status, "WITHDRAWN")).toBe(true);
    }
  });

  it("is not possible once the application is finished", () => {
    for (const status of TERMINAL) {
      // Skip WITHDRAWN itself. Staying on the same status counts as allowed,
      // because saving a form without touching the dropdown is not a move.
      if (status === "WITHDRAWN") continue;

      expect(canTransition(status, "WITHDRAWN")).toBe(false);
    }
  });
});

describe("rejection", () => {
  it("is possible from applied, screening and interview", () => {
    expect(canTransition("APPLIED", "REJECTED")).toBe(true);
    expect(canTransition("SCREENING", "REJECTED")).toBe(true);
    expect(canTransition("INTERVIEW", "REJECTED")).toBe(true);
  });

  it("is not possible from a draft, because nobody has seen it yet", () => {
    expect(canTransition("DRAFT", "REJECTED")).toBe(false);
  });

  it("gives way to declining once an offer exists", () => {
    expect(canTransition("OFFER", "REJECTED")).toBe(false);
    expect(canTransition("OFFER", "DECLINED")).toBe(true);
  });
});

describe("terminal statuses", () => {
  it("lead nowhere", () => {
    for (const status of TERMINAL) {
      expect(isTerminal(status)).toBe(true);
      expect(nextStatuses(status)).toHaveLength(0);

      for (const target of ALL_STATUSES) {
        if (target === status) continue;
        expect(canTransition(status, target)).toBe(false);
      }
    }
  });

  it("are the only ones that lead nowhere", () => {
    for (const status of ACTIVE) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

describe("staying put", () => {
  it("is allowed for every status, because saving a form is not a move", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });
});
