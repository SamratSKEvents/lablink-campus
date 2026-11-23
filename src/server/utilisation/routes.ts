/**
 * Learn: utilisation (booked vs actual) and Opportunity Radar: idle units in one place,
 * over-demand in another, so departments share before they buy.
 */
import { Router } from "express";
import { classLabel } from "../../shared/catalogue.js";
import type { Booking, Equipment } from "../../shared/domain.js";
import { gini } from "../allocation/fairness.js";
import { radarActions, type RadarFacts } from "../ai/uses.js";
import { all, C, col, loadContext } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { handle } from "../middleware/errors.js";

export const utilisationRouter = Router();

export interface UnitUsage {
  id: string;
  name: string;
  lab: string;
  classId: string;
  bookedHours: number;
  actualHours: number;
  availableHours: number;
  utilisation: number;
}

/** Pure aggregation over a 7-day window (exported for tests). */
export function computeUsage(
  equipment: Equipment[],
  labs: { id: string; name: string; openMin: number; closeMin: number }[],
  bookings: Booking[],
  events: { bookingId: string; actualMin: number }[],
  days = 7,
): { units: UnitUsage[]; facts: RadarFacts } {
  const actual = new Map(events.map((e) => [e.bookingId, e.actualMin]));
  const units = equipment.map((e) => {
    const lab = labs.find((l) => l.id === e.labId);
    const availableHours = lab ? ((lab.closeMin - lab.openMin) / 60) * days * e.capacity : 0;
    const mine = bookings.filter((b) => b.equipmentId === e.id && ["confirmed", "checked_in", "completed", "no_show"].includes(b.status));
    const bookedHours = mine.reduce((s, b) => s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000, 0);
    const actualHours = mine.reduce((s, b) => s + (actual.get(b.id) ?? (b.status === "completed" || b.status === "checked_in" ? (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000 : 0)), 0) / 60;
    return { id: e.id, name: e.name, lab: lab?.name ?? "", classId: e.classId, bookedHours: round(bookedHours), actualHours: round(actualHours), availableHours, utilisation: availableHours ? round(actualHours / availableHours, 3) : 0 };
  });

  const byClass = new Map<string, { demand: number; supply: number }>();
  for (const u of units) {
    const c = byClass.get(u.classId) ?? { demand: 0, supply: 0 };
    c.demand += u.bookedHours;
    c.supply += u.availableHours;
    byClass.set(u.classId, c);
  }
  const facts: RadarFacts = {
    idle: units.filter((u) => u.availableHours > 0 && u.utilisation < 0.1).sort((a, b) => a.utilisation - b.utilisation).slice(0, 5).map((u) => ({ name: u.name, lab: u.lab, utilisation: u.utilisation })),
    hot: [...byClass].filter(([, v]) => v.supply > 0 && v.demand / v.supply > 0.5).map(([k, v]) => ({ classLabel: classLabel(k), demandHours: round(v.demand), supplyHours: round(v.supply) })),
  };
  return { units, facts };
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Hours booked per IST weekday (Mon..Sun) × hour (8..21), for the demand heatmap. */
export function demandHeatmap(bookings: Booking[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 14 }, () => 0));
  for (const b of bookings) {
    if (!["confirmed", "checked_in", "completed", "no_show"].includes(b.status)) continue;
    for (let t = new Date(b.start).getTime(); t < new Date(b.end).getTime(); t += 15 * 60_000) {
      const ist = new Date(t + 330 * 60_000);
      const dow = (ist.getUTCDay() + 6) % 7;
      const h = ist.getUTCHours() - 8;
      if (h >= 0 && h < 14) grid[dow]![h]! += 0.25;
    }
  }
  return grid.map((r) => r.map((v) => round(v)));
}

/** Booked vs used hours per IST day for the last `days` days. */
export function dailySeries(bookings: Booking[], events: { bookingId: string; actualMin: number }[], now: Date, days = 7) {
  const actual = new Map(events.map((e) => [e.bookingId, e.actualMin]));
  const key = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const out = Array.from({ length: days }, (_, i) => ({ day: key(new Date(now.getTime() - (days - i) * 86_400_000)), booked: 0, used: 0 }));
  for (const b of bookings) {
    const row = out.find((o) => o.day === key(new Date(b.start)));
    if (!row || !["completed", "no_show", "checked_in", "confirmed"].includes(b.status)) continue;
    const h = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000;
    row.booked += h;
    row.used += (actual.get(b.id) ?? (b.status === "completed" ? h * 60 : 0)) / 60;
  }
  return out.map((o) => ({ ...o, booked: round(o.booked), used: round(o.used) }));
}

utilisationRouter.get(
  "/admin/utilisation",
  requireAuth(["admin", "faculty", "technician"]),
  handle(async (_req, res) => {
    const ctx = await loadContext();
    const events = await all<{ bookingId: string; actualMin: number }>(C.usageEvents);
    const { units, facts } = computeUsage(ctx.equipment, ctx.labs, ctx.bookings, events);
    const actions = await radarActions(facts);
    const students = Object.values(ctx.users).filter((u) => u.role === "student");
    const decisions = await all<{ id: string; createdAt: string; explanation: string; winnerUserId: string | null; policyVersion: string }>(col(C.decisions).orderBy("createdAt", "desc").limit(10));
    // Lab hours per student over the window: the Lorenz curve's input.
    const hoursBy = new Map(students.map((st) => [st.id, 0]));
    for (const b of ctx.bookings)
      if (hoursBy.has(b.userId) && ["completed", "checked_in"].includes(b.status))
        hoursBy.set(b.userId, hoursBy.get(b.userId)! + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000);
    const studentHours = [...hoursBy.values()].map((h) => round(h)).sort((a, b) => a - b);
    const totals = units.reduce((s, u) => ({ booked: s.booked + u.bookedHours, actual: s.actual + u.actualHours, available: s.available + u.availableHours }), { booked: 0, actual: 0, available: 0 });
    res.json({
      totals: { ...totals, utilisation: totals.available ? round(totals.actual / totals.available, 3) : 0, noShowHoursRecovered: round(totals.booked - totals.actual) },
      units,
      radar: { ...facts, actions: actions.data.actions, source: actions.source },
      fairness: { gini: gini(studentHours), students: students.length, studentHours },
      heatmap: demandHeatmap(ctx.bookings),
      daily: dailySeries(ctx.bookings, events, ctx.now),
      decisions,
    });
  }),
);
