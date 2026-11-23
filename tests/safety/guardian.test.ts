import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HAZARD_LEVELS } from "../../src/shared/domain.js";
import {
  atLeastAsStrict,
  humanLower,
  mergeSafety,
  staffAssessment,
  wellnessStep,
  type SafetyAssessment,
} from "../../src/server/safety/guardian.js";

const level = fc.constantFrom(...HAZARD_LEVELS);
const strs = fc.array(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0), { maxLength: 4 });
const assessment: fc.Arbitrary<SafetyAssessment> = fc.record({
  level,
  hazards: strs,
  precautions: strs,
  ppe: strs,
  reviewRequired: fc.boolean(),
});
// Anything an AI could return, including hostile attempts to lower safety.
const aiFlags = fc.option(
  fc.record(
    {
      level: fc.oneof(level, fc.constant("none" as const), fc.constant("bogus" as never)),
      hazards: fc.oneof(strs, fc.constant<string[]>([])),
      precautions: fc.oneof(strs, fc.constant<string[]>([])),
      ppe: fc.oneof(strs, fc.constant<string[]>([])),
      reviewRequired: fc.boolean(),
    },
    { requiredKeys: [] },
  ),
  { nil: null },
);

describe("Guardian: AI may raise caution, only a human may lower it", () => {
  it("property: merged result is never less strict than staff rules, for any AI output", () => {
    fc.assert(
      fc.property(assessment, aiFlags, (staff, ai) => atLeastAsStrict(mergeSafety(staff, ai), staff)),
      { numRuns: 2000 },
    );
  });

  it("property: merging is idempotent and never drops what AI added", () => {
    fc.assert(
      fc.property(assessment, assessment, (staff, ai) => {
        const m = mergeSafety(staff, ai);
        return atLeastAsStrict(m, ai) && JSON.stringify(mergeSafety(m, ai)) === JSON.stringify(m);
      }),
    );
  });

  it("property: high level always requires a faculty review", () => {
    fc.assert(fc.property(assessment, aiFlags, (s, ai) => mergeSafety(s, ai).level !== "high" || mergeSafety(s, ai).reviewRequired));
  });

  it("AI failure (null) falls back to exactly the staff rules", () => {
    const staff: SafetyAssessment = { level: "medium", hazards: ["Burns"], precautions: ["Stand"], ppe: ["Glasses"], reviewRequired: false };
    expect(mergeSafety(staff, null)).toEqual(staff);
  });

  it("only PIN-verified staff with a reason can lower a level", () => {
    const s: SafetyAssessment = { level: "high", hazards: [], precautions: [], ppe: [], reviewRequired: true };
    expect(() => humanLower(s, null, { level: "low", reviewRequired: false }, "AI says it's fine actually")).toThrow();
    expect(() => humanLower(s, { role: "student", pinVerified: true }, { level: "low", reviewRequired: false }, "I know what I'm doing")).toThrow();
    expect(() => humanLower(s, { role: "faculty", pinVerified: false }, { level: "low", reviewRequired: false }, "Reviewed on site today")).toThrow();
    expect(() => humanLower(s, { role: "faculty", pinVerified: true }, { level: "low", reviewRequired: false }, "ok")).toThrow();
    expect(humanLower(s, { role: "faculty", pinVerified: true }, { level: "low", reviewRequired: false }, "Reviewed on site, enclosure vented").level).toBe("low");
  });
});

describe("staff hazard table", () => {
  it("flags LiPo charging as high risk needing review", () => {
    const a = staffAssessment([{ classId: "3d-printer", durationMin: 120 }], "Robot with a LiPo battery inside a printed case");
    expect(a.level).toBe("high");
    expect(a.reviewRequired).toBe(true);
    expect(a.precautions.join(" ")).toMatch(/unattended/);
  });
  it("requires a fume extractor for long soldering", () => {
    const a = staffAssessment([{ classId: "soldering-station", durationMin: 180 }], "PCB assembly");
    expect(a.precautions.join(" ")).toMatch(/fume extractor/i);
  });
});

describe("lone-worker wellness", () => {
  const t0 = "2026-11-23T05:00:00.000Z";
  const at = (min: number) => new Date(new Date(t0).getTime() + min * 60_000);
  it("prompts every 20 minutes", () => {
    expect(wellnessStep({ sessionStart: t0, lastResponseAt: null, promptedAt: null }, at(19))).toBe("none");
    expect(wellnessStep({ sessionStart: t0, lastResponseAt: null, promptedAt: null }, at(20))).toBe("prompt");
  });
  it("re-prompts, then requests a welfare check", () => {
    const s = { sessionStart: t0, lastResponseAt: null, promptedAt: at(20).toISOString() };
    expect(wellnessStep(s, at(21))).toBe("none");
    expect(wellnessStep(s, at(22))).toBe("reprompt");
    expect(wellnessStep(s, at(24))).toBe("welfare_check");
  });
  it("property: a missed check-in never yields anything beyond a welfare check (never SOS)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600 }), fc.integer({ min: 0, max: 600 }), (p, n) => {
        const r = wellnessStep({ sessionStart: t0, lastResponseAt: null, promptedAt: at(p).toISOString() }, at(p + n));
        return ["none", "prompt", "reprompt", "welfare_check"].includes(r);
      }),
    );
  });
  it("property: a missed check-in always eventually escalates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 600 }), (n) =>
        wellnessStep({ sessionStart: t0, lastResponseAt: null, promptedAt: t0 }, at(n)) === "welfare_check",
      ),
    );
  });
});
