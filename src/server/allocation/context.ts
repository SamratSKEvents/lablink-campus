import type { Booking, Equipment, Lab, Project, User } from "../../shared/domain.js";
import { ACTIVE_BOOKING_STATUSES } from "../../shared/domain.js";
import { classById } from "../../shared/catalogue.js";
import { POLICY } from "./policy.js";

/** A read-only snapshot of the world the engine reasons about. No I/O happens inside the engine. */
export interface EngineContext {
  now: Date;
  equipment: Equipment[];
  labs: Lab[];
  bookings: Booking[];
  users: Record<string, User>;
  projects?: Record<string, Project>;
  /** Technician-verified or spec-rule equivalences, as unordered pairs of equipment ids. */
  equivalences: [string, string][];
}

export function labOf(ctx: EngineContext, eq: Equipment): Lab | undefined {
  return ctx.labs.find((l) => l.id === eq.labId);
}

export function hazardOf(eq: Equipment): "none" | "low" | "medium" | "high" {
  return classById(eq.classId)?.hazard ?? "low";
}

/** Fields shared by booking records and their seat locks. */
export type SeatOccupancy = Pick<Booking, "status" | "start" | "expiresAt" | "checkedInAt">;

/**
 * Whether a booking currently occupies its seat. Lazy expiry: a hold past its
 * expiresAt, or a confirmed booking with no check-in after the grace window, is free.
 */
export function occupiesSeat(b: SeatOccupancy, now: Date): boolean {
  if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) return false;
  if (b.status === "held" && b.expiresAt && new Date(b.expiresAt) <= now) return false;
  if (b.status === "confirmed") {
    const graceEnd = new Date(new Date(b.start).getTime() + POLICY.noShowGraceMin * 60_000);
    if (now > graceEnd && !b.checkedInAt) return false;
  }
  return true;
}

export function areEquivalent(ctx: EngineContext, a: string, b: string): boolean {
  return ctx.equivalences.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
