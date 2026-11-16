import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  keyFor,
  POSTING_READS_PER_ACCOUNT,
  POSTING_READS_PER_INSTALLATION,
} from "@/lib/rate-limit";
import { closeRedis, getRedis } from "@/lib/redis";
import { createUser, resetDatabase } from "@/test/database";
import { freshAddress } from "@/test/mailpit";
import { form, redirectTarget } from "@/test/next";
import { resetRedis } from "@/test/redis";
import { suggestFromPosting } from "./actions";

// Two stand-ins. The signed-in user comes from here, because next/headers
// needs a running Next request, and the model is replaced by a function the
// tests answer for. The guard, the input check, the schema, the limits, the
// database and Redis are real. What each model is actually sent is covered
// next to its reader.
const request = vi.hoisted(() => ({ session: null as SessionPayload | null }));

vi.mock("@/lib/auth/cookies", () => ({
  getSession: async () => request.session,
}));

const model = vi.hoisted(() => ({
  available: true,
  read: vi.fn<(posting: string) => Promise<unknown>>(),
}));

vi.mock("./reader", () => ({
  postingReaderAvailable: () => model.available,
  readPosting: model.read,
}));

const POSTING = `Junior Developer (m/w/d) at Northwind Systems GmbH in Stuttgart.
We build logistics software with TypeScript and React. Apply by 30 November 2026.`;

/** What a model returns for the posting above. */
const ANSWER = {
  isJobPosting: true,
  company: "Northwind Systems GmbH",
  role: "Junior Developer",
  location: "Stuttgart",
  salaryMin: null,
  salaryMax: null,
  applyBy: "2026-11-30",
  requirements: ["TypeScript", "React"],
};

let me: string;

/** Signs in as a new account and returns its id. */
async function signInAsSomeoneNew(): Promise<string> {
  const { id } = await createUser(freshAddress("posting"));
  request.session = { userId: id, sessionVersion: 0 };
  return id;
}

/** How many reads a limit has counted for a subject. */
async function counted(key: string): Promise<number> {
  return (await getRedis())!.zCard(key);
}

function read(posting = POSTING) {
  return suggestFromPosting(form({ posting }));
}

beforeEach(async () => {
  await Promise.all([resetDatabase(), resetRedis()]);
  me = await signInAsSomeoneNew();
  model.available = true;
  model.read.mockReset().mockResolvedValue(ANSWER);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), closeRedis()]);
});

describe("suggestFromPosting", () => {
  it("suggests values for the form and saves nothing", async () => {
    const result = await read(`\n  ${POSTING}  \n`);

    expect(result).toEqual({
      suggestion: {
        id: expect.any(String),
        fields: {
          companyName: "Northwind Systems GmbH",
          role: "Junior Developer",
          salaryMin: "",
          salaryMax: "",
          notes:
            "Location: Stuttgart\nApply by: 30 Nov 2026\n\nRequirements:\n- TypeScript\n- React",
        },
        filled: ["company", "role", "notes"],
      },
    });
    // The model got the text without the whitespace around it, once.
    expect(model.read.mock.calls).toEqual([[POSTING]]);
    expect(await prisma.application.count()).toBe(0);
    expect(await prisma.company.count()).toBe(0);
  });

  it("marks every suggestion as a new one, so the form knows to take it", async () => {
    const first = await read();
    const second = await read();

    expect(first.suggestion!.id).not.toBe(second.suggestion!.id);
  });

  it("sends a signed-out visitor to sign in without calling the model", async () => {
    request.session = null;

    expect(await redirectTarget(read())).toBe("/sign-in");
    expect(model.read).not.toHaveBeenCalled();
  });

  it.each([
    ["too short to be a posting", "We are hiring.", /^That is too short to be a job posting\./],
    ["longer than a posting gets", "x".repeat(20_001), /^That is more than 20,000 characters\./],
  ])("refuses text that is %s before it costs anything", async (_name, posting, message) => {
    const result = await read(posting);

    expect(result.message).toMatch(message);
    expect(result.suggestion).toBeUndefined();
    expect(model.read).not.toHaveBeenCalled();
    expect(await counted(keyFor(POSTING_READS_PER_ACCOUNT, me))).toBe(0);
  });

  it.each([
    ["a string", POSTING],
    ["an object", { posting: POSTING }],
    ["nothing", undefined],
  ])("treats %s in place of the form as no text at all", async (_name, input) => {
    const result = await suggestFromPosting(input);

    expect(result.message).toMatch(/^That is too short to be a job posting\./);
    expect(model.read).not.toHaveBeenCalled();
  });

  it("says so when no model is set up, and counts nothing", async () => {
    model.available = false;

    expect(await read()).toEqual({ message: "Reading postings is not set up here." });
    expect(model.read).not.toHaveBeenCalled();
    expect(await counted(keyFor(POSTING_READS_PER_ACCOUNT, me))).toBe(0);
  });
});

describe("an answer that cannot be used", () => {
  it("leaves the form alone when the model cannot be reached", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    model.read.mockRejectedValue(new Error("Ollama answered with status 500."));

    expect(await read()).toEqual({
      message: "The posting could not be read. Try again in a moment.",
    });
    expect(errors).toHaveBeenCalledOnce();
  });

  it.each([
    ["with a field missing", { ...ANSWER, role: undefined }],
    ["with a salary as text", { ...ANSWER, salaryMin: "48.000 EUR" }],
    ["that is prose and not data", "Sure! Here is the posting you asked about."],
    ["that is empty", null],
  ])("throws away an answer %s", async (_name, answer) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    model.read.mockResolvedValue(answer);

    expect(await read()).toEqual({
      message: "The answer to that posting made no sense, so nothing was filled in.",
    });
  });

  it("logs which version of the wording produced it, and none of what the user pasted", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    model.read.mockResolvedValue({ ...ANSWER, salaryMin: "a secret from the posting" });

    await read();

    expect(errors.mock.calls).toEqual([
      ["Answer to a posting thrown away, extraction v1.", ["salaryMin: invalid_type"]],
    ]);
  });

  it("says so when the model does not take the text for a job posting", async () => {
    model.read.mockResolvedValue({
      isJobPosting: false,
      company: null,
      role: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      applyBy: null,
      requirements: [],
    });

    expect(await read()).toEqual({
      message: "That does not read like a job posting, so nothing was filled in.",
    });
  });

  it("does not trust the fields of an answer that says it is no job posting", async () => {
    model.read.mockResolvedValue({ ...ANSWER, isJobPosting: false });

    expect((await read()).suggestion).toBeUndefined();
  });

  it("says so when neither a company nor a role was found", async () => {
    model.read.mockResolvedValue({ ...ANSWER, company: null, role: null });

    expect(await read()).toEqual({
      message: "Neither a company nor a role could be found in that text.",
    });
  });
});

describe("the limits", () => {
  it("reads ten postings an hour for one account, and the eleventh waits", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await read()).suggestion).toBeDefined();
    }

    const eleventh = await read();

    expect(eleventh.message).toMatch(
      /^You can have 10 postings read per hour\. Try again in \d+ minutes?\.$/,
    );
    expect(eleventh.suggestion).toBeUndefined();
    expect(model.read).toHaveBeenCalledTimes(10);
  });

  it("counts a read whose answer was useless, because it cost the same", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    model.read.mockRejectedValue(new Error("timeout"));

    await read();

    expect(await counted(keyFor(POSTING_READS_PER_ACCOUNT, me))).toBe(1);
  });

  it("keeps accounts apart", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await read();
    }

    await signInAsSomeoneNew();

    expect((await read()).suggestion).toBeDefined();
  });

  it("does not let an account that is over its limit use up what everyone shares", async () => {
    for (let attempt = 0; attempt < 13; attempt += 1) {
      await read();
    }

    expect(await counted(keyFor(POSTING_READS_PER_INSTALLATION, "everyone"))).toBe(10);
  });

  it("stops reading for everyone once the installation has read two hundred in a day", async () => {
    // Twenty accounts that each stay within their own limit.
    for (let account = 0; account < 20; account += 1) {
      await signInAsSomeoneNew();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await read();
      }
    }

    expect(model.read).toHaveBeenCalledTimes(200);

    await signInAsSomeoneNew();
    const next = await read();

    expect(next).toEqual({
      message: "The limit for reading postings is reached for now. Try again later.",
    });
    expect(model.read).toHaveBeenCalledTimes(200);
  });

  it("refuses to read while the limits cannot be counted, instead of reading without them", async () => {
    await closeRedis();
    vi.stubEnv("REDIS_URL", "");

    try {
      expect(await read()).toEqual({
        message: "Postings cannot be read right now. The form below works as always.",
      });
      expect(model.read).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      await closeRedis();
    }
  });
});
