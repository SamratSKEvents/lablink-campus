import { describe, expect, it } from "vitest";
import { gini, resolveConflict, scoreContender, type Contender } from "../../src/server/allocation/fairness.js";
import { POLICY } from "../../src/server/allocation/policy.js";
import { ctx, ist, project, unit, user } from "../fixtures.js";

const contender = (over: Partial<Contender> = {}): Contender => ({
  user: user(),
  project: project(),
  taskId: "test",
  fullyUnblocks: false,
  ...over,
});

describe("Layer 3 fairness", () => {
  it("weights sum to 100", () => {
    expect(Object.values(POLICY.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("a verified deadline and stage score higher than unverified ones (anti-gaming)", () => {
    const c = ctx();
    const unverified = scoreContender(c, contender(), unit());
    const verified = scoreContender(c, contender({ project: project({ verifiedBy: "u-fac" }) }), unit());
    expect(verified.deadline).toBeGreaterThan(unverified.deadline);
    expect(verified.stage).toBeGreaterThan(unverified.stage);
  });

  it("less recent usage scores higher; no-shows are penalised (capped)", () => {
    const c = ctx();
    const heavy = scoreContender(c, contender({ user: user({ recentUsageHours: 20 }) }), unit());
    const light = scoreContender(c, contender(), unit());
    expect(light.usage).toBeGreaterThan(heavy.usage);
    expect(scoreContender(c, contender({ user: user({ noShowCount: 99 }) }), unit()).noShowPenalty).toBe(-POLICY.noShowPenaltyMax);
  });

  it("waiting longer raises priority (prevents starvation)", () => {
    const c = ctx();
    const waited = scoreContender(c, contender({ project: project({ requestedAt: ist(-3, 9).toISOString() }) }), unit());
    expect(waited.wait).toBe(POLICY.weights.wait);
  });

  it("picks the highest score, filters ineligible contenders, and records alternatives", () => {
    const c = ctx({ equipment: [...ctx().equipment, unit({ id: "scope-2", name: "Oscilloscope 2" })] });
    const urgent = contender({ project: project({ id: "p-a", verifiedBy: "u-fac", stage: "final", deadline: ist(1, 17).toISOString() }) });
    const relaxed = contender({ user: user({ id: "u-other", name: "Arjun" }), project: project({ id: "p-b", ownerId: "u-other", deadline: ist(20, 17).toISOString() }) });
    const blocked = contender({ user: user({ id: "u-x", name: "Zed" }), project: project({ id: "p-c", ownerId: "u-x" }) });
    const eq = unit({ requiresCert: true });
    // Only Priya and Arjun are certified.
    urgent.user = user({ certifications: [{ classId: "oscilloscope", level: "full", expiresAt: "2027-01-01T00:00:00Z", grantedBy: "t" }] });
    relaxed.user = { ...relaxed.user, certifications: urgent.user.certifications };

    const d = resolveConflict(c, eq, ist(0, 14), ist(0, 15), [relaxed, blocked, urgent]);
    expect(d.winnerUserId).toBe("u-priya");
    expect(d.candidates.find((x) => x.userId === "u-x")).toMatchObject({ eligible: false });
    expect(d.alternatives["u-other"]!.length).toBeGreaterThan(0);
    expect(d.policyVersion).toBe(POLICY.version);
    expect(d.explanation).toMatch(/Priya/);
  });

  it("a slot after a contender's deadline can't help them, so they're filtered with a reason", () => {
    const late = contender({ project: project({ deadline: ist(0, 12).toISOString() }) });
    const d = resolveConflict(ctx(), unit(), ist(0, 14), ist(0, 15), [late]);
    expect(d.candidates[0]).toMatchObject({ eligible: false });
    expect(d.winnerUserId).toBeNull();
  });

  it("is deterministic on ties (user id order)", () => {
    const c = ctx();
    const a = contender({ user: user({ id: "u-a", name: "A" }) });
    const b = contender({ user: user({ id: "u-b", name: "B" }) });
    expect(resolveConflict(c, unit(), ist(0, 14), ist(0, 15), [b, a]).winnerUserId).toBe("u-a");
  });

  it("offers a shared seat on shareable units", () => {
    const big = unit({ capacity: 1, id: "bench-big", name: "Big bench" });
    const c = ctx({ equipment: [big] });
    const d = resolveConflict(c, { ...big, capacity: 2 }, ist(0, 14), ist(0, 15), [contender(), contender({ user: user({ id: "u-b", name: "B" }) })]);
    expect(d.winnerUserId).not.toBeNull();
  });

  it("gini: 0 for equal, higher for unequal", () => {
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([0, 0, 0, 20])).toBeGreaterThan(0.7);
    expect(gini([])).toBe(0);
  });
});
