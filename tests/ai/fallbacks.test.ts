import { describe, expect, it } from "vitest";
import { CLASS_IDS } from "../../src/shared/catalogue.js";
import { approvalCopilot, clusterNearMisses, parseSearch, planProject, xrayCoverage } from "../../src/server/ai/uses.js";
import { topoSort } from "../../src/server/allocation/scheduler.js";
import { project, user } from "../fixtures.js";

// AI_DISABLED=1 is set in vitest.config.ts: every call must use its deterministic fallback.
describe("AI fallbacks (AI_DISABLED=1)", () => {
  it("plans a robotics project from the template, with valid classes and an acyclic DAG", async () => {
    const r = await planProject("A robotic arm with servo motors that sorts parts");
    expect(r.source).toBe("fallback");
    expect(r.data.category).toBe("robotics");
    for (const t of r.data.tasks) expect(CLASS_IDS).toContain(t.classId);
    expect(topoSort(r.data.tasks).error).toBeUndefined();
    expect(xrayCoverage(r.data).supported).toBe(true);
  });

  it("falls back to a generic plan for anything else", async () => {
    const r = await planProject("Something completely unusual and new");
    expect(r.data.tasks.length).toBeGreaterThan(0);
  });

  it("copilot fallback flags missing certifications and only ever suggests", async () => {
    const r = await approvalCopilot(project(), user(), "low");
    expect(r.data.riskFlags.join(" ")).toMatch(/Not yet certified/);
    expect(["approve", "approve_with_conditions", "needs_discussion"]).toContain(r.data.suggestion);
  });

  it("search fallback extracts classes and flags", async () => {
    const r = await parseSearch("accessible oscilloscope free now");
    expect(r.data.classIds).toContain("oscilloscope");
    expect(r.data.accessibleOnly).toBe(true);
    expect(r.data.availableNow).toBe(true);
  });

  it("near-miss fallback clusters repeated locations", async () => {
    const r = await clusterNearMisses([
      { id: "a", where: "Soldering bench 4", text: "fumes" },
      { id: "b", where: "Soldering bench 4", text: "smoke smell" },
      { id: "c", where: "Scope 2", text: "frayed probe" },
    ]);
    expect(r.data.clusters).toEqual([expect.objectContaining({ reportIds: ["a", "b"] })]);
  });

  it("X-Ray declines when confidence is low or shapes are unknown", () => {
    expect(xrayCoverage({ parts: [], confidence: "high" }).supported).toBe(false);
    expect(xrayCoverage({ parts: [{ name: "x", shape: "board" }], confidence: "low" }).supported).toBe(false);
  });
});
