import { describe, expect, it } from "vitest";
import { deadlineRisk, scheduleProject, topoSort } from "../../src/server/allocation/scheduler.js";
import { booking, ctx, ist, project, unit } from "../fixtures.js";

describe("topoSort", () => {
  it("orders by dependency", () => {
    const { order } = topoSort(project().tasks);
    expect(order.map((t) => t.id)).toEqual(["fab", "asm", "test"]);
  });
  it("rejects cycles and unknown deps", () => {
    expect(topoSort([{ id: "a", name: "A", classId: "x", durationMin: 15, dependsOn: ["b"] }, { id: "b", name: "B", classId: "x", durationMin: 15, dependsOn: ["a"] }]).error).toMatch(/cycle/);
    expect(topoSort([{ id: "a", name: "A", classId: "x", durationMin: 15, dependsOn: ["zzz"] }]).error).toMatch(/unknown/);
  });
});

describe("Layer 2 scheduler", () => {
  it("places a 3-step chain in order with 15-minute buffers", () => {
    const r = scheduleProject(ctx(), project());
    expect(r.status).toBe("feasible");
    const [fab, asm, test] = r.placements;
    expect(fab!.start).toBe(ist(0, 9).toISOString());
    expect(new Date(asm!.start).getTime()).toBeGreaterThanOrEqual(new Date(fab!.end).getTime() + 15 * 60_000);
    expect(new Date(test!.start).getTime()).toBeGreaterThanOrEqual(new Date(asm!.end).getTime() + 15 * 60_000);
    expect(new Date(r.finish!) <= new Date(project().deadline)).toBe(true);
  });

  it("never schedules two of the student's tasks at the same time", () => {
    const parallel = project({ tasks: [
      { id: "a", name: "Print", classId: "3d-printer", durationMin: 120, dependsOn: [] },
      { id: "b", name: "Wire", classId: "workstation", durationMin: 60, dependsOn: [] },
    ] });
    const [a, b] = scheduleProject(ctx(), parallel).placements;
    expect(new Date(a!.end) <= new Date(b!.start) || new Date(b!.end) <= new Date(a!.start)).toBe(true);
  });

  it("is deterministic", () => {
    expect(scheduleProject(ctx(), project())).toEqual(scheduleProject(ctx(), project()));
  });

  it("routes around existing bookings", () => {
    const c = ctx({ bookings: [booking({ equipmentId: "printer-1", start: ist(0, 9).toISOString(), end: ist(0, 13).toISOString() })] });
    const r = scheduleProject(c, project());
    expect(new Date(r.placements[0]!.start) >= ist(0, 13, 15)).toBe(true);
  });

  it("returns infeasible with a named blocker when the deadline is too close", () => {
    const r = scheduleProject(ctx(), project({ deadline: ist(0, 10).toISOString() }));
    expect(r.status).toBe("infeasible");
    expect(r.unresolved[0]!.reason).toBeTruthy();
  });

  it("returns a partial plan when a later step has no equipment", () => {
    const c = ctx({ equipment: ctx().equipment.filter((e) => e.classId !== "oscilloscope") });
    const r = scheduleProject(c, project());
    expect(r.status).toBe("partial");
    expect(r.placements.map((p) => p.taskId)).toEqual(["fab", "asm"]);
    expect(r.unresolved[0]).toMatchObject({ taskId: "test", rule: "no_equipment" });
  });

  it("names certification as the blocker so the student knows what to fix", () => {
    const c = ctx({ equipment: ctx().equipment.map((e) => (e.classId === "oscilloscope" ? { ...e, requiresCert: true } : e)) });
    const r = scheduleProject(c, project());
    expect(r.unresolved[0]).toMatchObject({ taskId: "test", rule: "certification" });
  });

  it("uses a verified equivalent unit when the exact class is busy", () => {
    const c = ctx({
      equipment: [...ctx().equipment.filter((e) => e.id !== "scope-1"), unit({ status: "out_of_service" }), unit({ id: "scope-x", classId: "logic-analyzer", name: "Mixed-signal scope" })],
      equivalences: [["scope-1", "scope-x"]],
    });
    const r = scheduleProject(c, project());
    expect(r.status).toBe("feasible");
    expect(r.placements[2]).toMatchObject({ equipmentId: "scope-x", fit: "equivalent" });
  });

  it("excludes units (Rescue Mode) and respects fixed placements", () => {
    const c = ctx({ equipment: [...ctx().equipment, unit({ id: "scope-2", name: "Oscilloscope 2" })] });
    const r = scheduleProject(c, project(), { excludeEquipment: ["scope-1"] });
    expect(r.placements.find((p) => p.taskId === "test")!.equipmentId).toBe("scope-2");
  });

  it("deadline risk reflects slack", () => {
    const r = scheduleProject(ctx(), project());
    expect(deadlineRisk(r, project().deadline)).toBe("on_track");
    expect(deadlineRisk({ ...r, status: "partial" }, project().deadline)).toBe("at_risk");
    expect(deadlineRisk({ ...r, finish: ist(4, 10).toISOString() }, ist(4, 17).toISOString())).toBe("at_risk");
  });
});
