/**
 * Layer 1: hard rules. A slot that breaks any of these is never offered, whatever
 * the fairness score. Each rule returns a named, human-readable reason.
 */
import type { Booking, Equipment, User } from "../../shared/domain.js";
import { istDayKey, istMinuteOfDay, istWeekKey, overlaps } from "../../shared/time.js";
import { hazardOf, labOf, occupiesSeat, type EngineContext } from "./context.js";
import { POLICY } from "./policy.js";

export type RuleId =
  | "status"
  | "maintenance"
  | "hours"
  | "supervision"
  | "certification"
  | "team_certification"
  | "weekly_cap"
  | "capacity"
  | "fatigue_daily"
  | "fatigue_continuous"
  | "lone_worker"
  | "past";

export type RuleResult = { ok: true; seat: number } | { ok: false; rule: RuleId; reason: string };

export interface SlotRequest {
  user: User;
  /** Other team members who will be present (they must meet prerequisites too). */
  team?: User[];
  equipment: Equipment;
  start: Date;
  end: Date;
  buddyId?: string;
  /** Bookings proposed earlier in the same plan; treated as real for capacity and fatigue. */
  pending?: Booking[];
}

function hasValidCert(user: User, classId: string, at: Date): "full" | "supervised" | null {
  const c = user.certifications.find((x) => x.classId === classId && new Date(x.expiresAt) > at);
  return c ? c.level : null;
}

function withinDailyWindow(start: Date, end: Date, fromMin: number, toMin: number): boolean {
  const s = istMinuteOfDay(start);
  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  return istDayKey(start) === istDayKey(new Date(end.getTime() - 1)) && s >= fromMin && s + durationMin <= toMin;
}

function userBookings(ctx: EngineContext, req: SlotRequest): Booking[] {
  return [...ctx.bookings, ...(req.pending ?? [])].filter(
    // Completed sessions still count towards fatigue and weekly caps.
    (b) => b.userId === req.user.id && (occupiesSeat(b, ctx.now) || b.status === "completed"),
  );
}

/** Check one candidate slot against every hard rule. */
export function checkSlot(ctx: EngineContext, req: SlotRequest): RuleResult {
  const { equipment: eq, start, end, user } = req;
  const lab = labOf(ctx, eq);
  const durationMin = (end.getTime() - start.getTime()) / 60_000;

  if (start < ctx.now) return { ok: false, rule: "past", reason: "That time has already passed." };
  if (eq.status !== "available")
    return { ok: false, rule: "status", reason: `${eq.name} is ${eq.status.replace(/_/g, " ")}.` };
  if (eq.maintenanceWindows.some((w) => overlaps(start, end, new Date(w.start), new Date(w.end))))
    return { ok: false, rule: "maintenance", reason: `${eq.name} has scheduled maintenance then.` };
  if (!lab || !withinDailyWindow(start, end, lab.openMin, lab.closeMin))
    return { ok: false, rule: "hours", reason: "Outside the lab's opening hours." };

  const staffed = withinDailyWindow(start, end, lab.staffedFromMin, lab.staffedToMin);
  const cert = hasValidCert(user, eq.classId, start);
  if (eq.requiresCert && !cert)
    return { ok: false, rule: "certification", reason: `You need a valid ${eq.classId} certification.` };
  for (const member of req.team ?? []) {
    if (eq.requiresCert && !hasValidCert(member, eq.classId, start))
      return {
        ok: false,
        rule: "team_certification",
        reason: `${member.name} isn't certified for this equipment yet.`,
      };
  }
  if ((eq.requiresSupervision || cert === "supervised") && !staffed)
    return { ok: false, rule: "supervision", reason: "Needs a technician on shift; pick a staffed slot." };

  const hazard = hazardOf(eq);
  if (hazard === "high" && !staffed && !req.buddyId && !(req.team && req.team.length > 0))
    return {
      ok: false,
      rule: "lone_worker",
      reason: "High-hazard work outside staffed hours needs a booked buddy or a technician on shift.",
    };

  const mine = userBookings(ctx, req);
  if (durationMin > POLICY.maxContinuousMin)
    return {
      ok: false,
      rule: "fatigue_continuous",
      reason: `Sessions are capped at ${POLICY.maxContinuousMin / 60} hours in a row. Split it up and take a break.`,
    };
  if (hazard === "medium" || hazard === "high") {
    const day = istDayKey(start);
    const dayMin = mine
      .filter((b) => istDayKey(new Date(b.start)) === day)
      .reduce((s, b) => s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000, 0);
    if (dayMin + durationMin > POLICY.maxDailyLabHours * 60)
      return {
        ok: false,
        rule: "fatigue_daily",
        reason: `That would be over ${POLICY.maxDailyLabHours} lab hours today on hazardous equipment. A rested slot is safer.`,
      };
  }

  const week = istWeekKey(start);
  const classIds = new Set(ctx.equipment.filter((e) => e.classId === eq.classId).map((e) => e.id));
  const weekMin = mine
    .filter((b) => classIds.has(b.equipmentId) && istWeekKey(new Date(b.start)) === week)
    .reduce((s, b) => s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000, 0);
  if (weekMin + durationMin > POLICY.weeklyCapHoursPerClass * 60)
    return {
      ok: false,
      rule: "weekly_cap",
      reason: `Weekly cap of ${POLICY.weeklyCapHoursPerClass} h on this equipment type reached, so others get a turn.`,
    };

  const seat = freeSeat(ctx, eq, start, end, req.pending);
  if (seat < 0) return { ok: false, rule: "capacity", reason: `${eq.name} is fully booked then.` };
  return { ok: true, seat };
}

/** Lowest free seat for [start, end) including the buffer, or -1. */
export function freeSeat(ctx: EngineContext, eq: Equipment, start: Date, end: Date, pending: Booking[] = []): number {
  const buf = POLICY.bufferMin * 60_000;
  const taken = new Set(
    [...ctx.bookings, ...pending]
      .filter(
        (b) =>
          b.equipmentId === eq.id &&
          occupiesSeat(b, ctx.now) &&
          overlaps(new Date(new Date(b.start).getTime() - buf), new Date(new Date(b.end).getTime() + buf), start, end),
      )
      .map((b) => b.seat),
  );
  for (let s = 0; s < eq.capacity; s++) if (!taken.has(s)) return s;
  return -1;
}
