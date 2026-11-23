/** Benchmark invariants only (never marketing numbers): no conflicts, no rule breaks, deterministic. */
import { describe, expect, it } from "vitest";
import { buildScenario, countConflicts, countRuleViolations, runFcfs, runLabLink } from "../src/server/allocation/benchmark.js";

const SMALL = { units: 30, students: 60, requests: 80, departments: 3 };

describe("benchmark invariants", () => {
  const sc = buildScenario(7, SMALL);
  const fcfs = runFcfs(sc);
  const lab = runLabLink(sc);

  it("never double-books a seat (either strategy)", () => {
    expect(countConflicts(fcfs.bookings)).toBe(0);
    expect(countConflicts(lab.bookings)).toBe(0);
  });

  it("never breaks a hard rule (either strategy)", () => {
    expect(countRuleViolations(sc, fcfs.bookings)).toBe(0);
    expect(countRuleViolations(sc, lab.bookings)).toBe(0);
  });

  it("is deterministic for a seed", () => {
    const again = runLabLink(buildScenario(7, SMALL));
    expect(again.bookings).toEqual(lab.bookings);
  });

  it("LabLink only commits chains that finish before their deadline", () => {
    const byProject = new Map<string, string[]>();
    for (const b of lab.bookings) byProject.set(b.projectId, [...(byProject.get(b.projectId) ?? []), b.end]);
    for (const [pid, ends] of byProject) {
      const p = sc.projects.find((x) => x.id === pid)!;
      expect(ends.every((e) => e <= p.deadline)).toBe(true);
    }
  });
});
