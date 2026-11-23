import { describe, expect, it } from "vitest";
import { checkSlot, freeSeat } from "../../src/server/allocation/hardRules.js";
import { booking, cert, ctx, ist, unit, user } from "../fixtures.js";

const at = (day: number, h: number, durH = 1) => ({ start: ist(day, h), end: ist(day, h + durH) });

describe("Layer 1 hard rules", () => {
  it("accepts a plain free slot and returns seat 0", () => {
    expect(checkSlot(ctx(), { user: user(), equipment: unit(), ...at(0, 13) })).toEqual({ ok: true, seat: 0 });
  });

  it("rejects equipment that is not available", () => {
    const r = checkSlot(ctx(), { user: user(), equipment: unit({ status: "maintenance" }), ...at(0, 13) });
    expect(r).toMatchObject({ ok: false, rule: "status" });
  });

  it("rejects slots inside a maintenance window", () => {
    const eq = unit({ maintenanceWindows: [{ start: ist(0, 12).toISOString(), end: ist(0, 14).toISOString() }] });
    expect(checkSlot(ctx(), { user: user(), equipment: eq, ...at(0, 13) })).toMatchObject({ rule: "maintenance" });
  });

  it("rejects slots outside opening hours", () => {
    expect(checkSlot(ctx(), { user: user(), equipment: unit(), ...at(0, 19, 2) })).toMatchObject({ rule: "hours" });
  });

  it("rejects the past", () => {
    expect(checkSlot(ctx(), { user: user(), equipment: unit(), start: ist(0, 8), end: ist(0, 9) })).toMatchObject({ rule: "past" });
  });

  it("requires certification when the unit demands it, and accepts a valid one", () => {
    const eq = unit({ requiresCert: true });
    expect(checkSlot(ctx(), { user: user(), equipment: eq, ...at(0, 13) })).toMatchObject({ rule: "certification" });
    const certified = user({ certifications: [cert("oscilloscope")] });
    expect(checkSlot(ctx(), { user: certified, equipment: eq, ...at(0, 13) }).ok).toBe(true);
  });

  it("ignores expired certifications", () => {
    const expired = user({ certifications: [{ ...cert("oscilloscope"), expiresAt: "2026-01-01T00:00:00Z" }] });
    expect(checkSlot(ctx(), { user: expired, equipment: unit({ requiresCert: true }), ...at(0, 13) })).toMatchObject({ rule: "certification" });
  });

  it("requires every present team member to be certified", () => {
    const eq = unit({ requiresCert: true });
    const me = user({ certifications: [cert("oscilloscope")] });
    const mate = user({ id: "u-mate", name: "Kabir" });
    expect(checkSlot(ctx(), { user: me, team: [mate], equipment: eq, ...at(0, 13) })).toMatchObject({ rule: "team_certification" });
  });

  it("supervised-only certification needs a staffed slot", () => {
    const eq = unit({ requiresCert: true });
    const sup = user({ certifications: [cert("oscilloscope", "supervised")] });
    expect(checkSlot(ctx(), { user: sup, equipment: eq, ...at(0, 17) })).toMatchObject({ rule: "supervision" });
    expect(checkSlot(ctx(), { user: sup, equipment: eq, ...at(0, 14) }).ok).toBe(true);
  });

  it("lone-worker rule: high hazard outside staffed hours needs a buddy", () => {
    const cutter = unit({ id: "lc-1", classId: "laser-cutter", name: "Laser cutter" });
    expect(checkSlot(ctx(), { user: user(), equipment: cutter, ...at(0, 18) })).toMatchObject({ rule: "lone_worker" });
    expect(checkSlot(ctx(), { user: user(), equipment: cutter, ...at(0, 18), buddyId: "u-other" }).ok).toBe(true);
  });

  it("fatigue: no session longer than 4 hours", () => {
    expect(checkSlot(ctx(), { user: user(), equipment: unit(), ...at(0, 10, 5) })).toMatchObject({ rule: "fatigue_continuous" });
  });

  it("fatigue: no more than 8 hazardous lab hours a day", () => {
    const iron = unit({ id: "iron-1", classId: "soldering-station", name: "Iron 1" });
    const c = ctx({
      equipment: [iron],
      bookings: [
        booking({ id: "a", userId: "u-priya", equipmentId: "iron-1", start: ist(0, 9).toISOString(), end: ist(0, 13).toISOString() }),
        booking({ id: "b", userId: "u-priya", equipmentId: "iron-1", start: ist(0, 13, 15).toISOString(), end: ist(0, 17, 15).toISOString() }),
      ],
    });
    expect(checkSlot(c, { user: user(), equipment: iron, start: ist(0, 17, 30), end: ist(0, 18, 30) })).toMatchObject({ rule: "fatigue_daily" });
  });

  it("weekly cap per equipment class", () => {
    const many = [0, 1, 2].map((d) =>
      booking({ id: `w${d}`, userId: "u-priya", start: ist(d, 9).toISOString(), end: ist(d, 13).toISOString() }),
    );
    const c = ctx({ bookings: many });
    expect(checkSlot(c, { user: user(), equipment: unit(), ...at(3, 14) })).toMatchObject({ rule: "weekly_cap" });
  });

  it("a person can't be in two sessions at once, even on different units", () => {
    const c = ctx({ bookings: [booking({ userId: "u-priya", equipmentId: "printer-1" })] }); // 10:00–12:00
    expect(checkSlot(c, { user: user(), equipment: unit(), start: ist(0, 11), end: ist(0, 13) })).toMatchObject({ rule: "self_overlap" });
  });

  it("capacity counts the 15-minute buffer", () => {
    const c = ctx({ bookings: [booking()] }); // 10:00–12:00
    expect(checkSlot(c, { user: user(), equipment: unit(), start: ist(0, 12), end: ist(0, 13) })).toMatchObject({ rule: "capacity" });
    expect(checkSlot(c, { user: user(), equipment: unit(), start: ist(0, 12, 15), end: ist(0, 13, 15) }).ok).toBe(true);
  });

  it("shareable units hand out the next free seat", () => {
    const big = unit({ capacity: 3 });
    const c = ctx({ equipment: [big], bookings: [booking(), booking({ id: "b2", seat: 1 })] });
    expect(freeSeat(c, big, ist(0, 10), ist(0, 11))).toBe(2);
  });

  it("lazy expiry: an expired hold no longer blocks the seat", () => {
    const hold = booking({ status: "held", expiresAt: ist(0, 8, 45).toISOString(), checkedInAt: undefined });
    expect(checkSlot(ctx({ bookings: [hold] }), { user: user(), equipment: unit(), ...at(0, 10) }).ok).toBe(true);
  });

  it("lazy no-show: a confirmed booking with no check-in after 15 minutes is released", () => {
    const stale = booking({ start: ist(0, 8).toISOString(), end: ist(0, 10).toISOString(), checkedInAt: undefined });
    expect(checkSlot(ctx({ bookings: [stale] }), { user: user(), equipment: unit(), start: ist(0, 9), end: ist(0, 10) }).ok).toBe(true);
  });
});
