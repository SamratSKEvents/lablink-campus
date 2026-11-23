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
    const totals = units.reduce((s, u) => ({ booked: s.booked + u.bookedHours, actual: s.actual + u.actualHours, available: s.available + u.availableHours }), { booked: 0, actual: 0, available: 0 });
    res.json({
      totals: { ...totals, utilisation: totals.available ? round(totals.actual / totals.available, 3) : 0, noShowHoursRecovered: round(totals.booked - totals.actual) },
      units,
      radar: { ...facts, actions: actions.data.actions, source: actions.source },
      fairness: { gini: gini(students.map((s) => s.recentUsageHours)), students: students.length },
      decisions,
    });
  }),
);
