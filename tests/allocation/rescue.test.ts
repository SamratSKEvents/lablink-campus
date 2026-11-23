import { describe, expect, it } from "vitest";
import { downstreamTasks, planRescue, whatIf } from "../../src/server/allocation/rescue.js";
import { booking, ctx, ist, project, unit } from "../fixtures.js";

describe("Rescue Mode", () => {
  const p = project();
  it("finds downstream tasks transitively", () => {
    expect([...downstreamTasks(p, ["fab"])].sort()).toEqual(["asm", "fab", "test"]);
    expect([...downstreamTasks(p, ["test"])]).toEqual(["test"]);
  });

  it("moves the affected task to a working unit and keeps earlier bookings fixed", () => {
    const bookings = [
      booking({ id: "b-fab", projectId: p.id, taskId: "fab", userId: p.ownerId, equipmentId: "printer-1", start: ist(0, 10).toISOString(), end: ist(0, 12).toISOString() }),
      booking({ id: "b-test", projectId: p.id, taskId: "test", userId: p.ownerId, equipmentId: "scope-1", start: ist(1, 14).toISOString(), end: ist(1, 15).toISOString() }),
    ];
    const c = ctx({
      equipment: [...ctx().equipment.map((e) => (e.id === "scope-1" ? { ...e, status: "out_of_service" as const } : e)), unit({ id: "scope-2", name: "Oscilloscope 2" })],
      bookings,
    });
    const [proposal] = planRescue(c, "scope-1", [p]);
    expect(proposal!.affectedBookingIds).toEqual(["b-test"]);
    expect(proposal!.moves.find((m) => m.taskId === "test")!.to.equipmentId).toBe("scope-2");
    expect(proposal!.needsApproval).toBe(false);
  });

  it("what-if reports how far the loser's project slips", () => {
    const c = ctx();
    const winner = project({ id: "p-win", ownerId: "u-other" });
    const loser = project();
    const [r] = whatIf(c, { equipmentId: "printer-1", start: ist(0, 9).toISOString(), end: ist(0, 11).toISOString(), seat: 0 }, winner, loser);
    expect(r!.slipMinutes).toBeGreaterThan(0);
    expect(r!.missesDeadline).toBe(false);
  });
});
