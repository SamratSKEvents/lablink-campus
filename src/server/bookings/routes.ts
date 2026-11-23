/**
 * Book: the engine schedules the whole task chain, then the bundle is held atomically
 * (30 min) and confirmed after every rule is re-checked. Check-in happens at the kiosk.
 */
import { Router } from "express";
import { z } from "zod";
import { holdSchema, type Booking, type Project } from "../../shared/domain.js";
import { occupiesSeat } from "../allocation/context.js";
import { checkSlot } from "../allocation/hardRules.js";
import { scheduleProject, type Placement } from "../allocation/scheduler.js";
import { all, C, col, get, loadContext, mustGet, type AccessRequest } from "../data.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle, HttpError } from "../middleware/errors.js";
import { holdBundle, replayIdempotent, setBookingStatus } from "./slotLocks.js";

export const bookingsRouter = Router();

async function ownedProject(id: string, uid: string): Promise<Project> {
  const p = await mustGet<Project>(C.projects, id, "Project");
  if (p.ownerId !== uid) throw forbidden();
  return p;
}

async function requireApproval(projectId: string) {
  const reqs = await all<AccessRequest>(col(C.requests).where("projectId", "==", projectId));
  if (!reqs.some((r) => r.status === "approved")) throw new HttpError(409, "This project needs faculty approval before booking.", "not_approved");
}

function fixedFor(bookings: Booking[], projectId: string, now: Date): Placement[] {
  return bookings
    .filter((b) => b.projectId === projectId && (occupiesSeat(b, now) || b.status === "completed"))
    .map((b) => ({ taskId: b.taskId, equipmentId: b.equipmentId, start: b.start, end: b.end, seat: b.seat, fit: "exact" }));
}

/** Preview the engine's plan for every unbooked task. */
bookingsRouter.post(
  "/projects/:id/schedule",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const p = await ownedProject(String(req.params.id), req.actor.uid);
    const ctx = await loadContext();
    res.json({ result: scheduleProject(ctx, p, { fixed: fixedFor(ctx.bookings, p.id, ctx.now) }) });
  }),
);

/** Hold the whole bundle in one transaction. Retries once with a fresh plan on contention. */
bookingsRouter.post(
  "/projects/:id/hold",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const { idempotencyKey } = holdSchema.parse(req.body);
    const buddyId = z.string().max(64).optional().parse(req.body.buddyId);
    const p = await ownedProject(String(req.params.id), req.actor.uid);
    await requireApproval(p.id);
    const replay = await replayIdempotent(req.actor.uid, idempotencyKey);
    if (replay) {
      res.json({ bookings: replay, replayed: true });
      return;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = await loadContext();
      const result = scheduleProject(ctx, p, { fixed: fixedFor(ctx.bookings, p.id, ctx.now) });
      if (!result.placements.length)
        throw new HttpError(409, result.unresolved[0]?.reason ?? "Nothing left to book.", "infeasible", { unresolved: result.unresolved });
      try {
        const held = await holdBundle({ userId: req.actor.uid, projectId: p.id, placements: result.placements, idempotencyKey, ...(buddyId ? { buddyId } : {}) });
        // A partial plan is held but never reported as complete.
        res.status(held.replayed ? 200 : 201).json({ bookings: held.bookings, status: result.status, unresolved: result.unresolved, replayed: held.replayed });
        return;
      } catch (e) {
        lastError = e;
        if (!(e instanceof HttpError && e.code === "slot_taken")) throw e;
      }
    }
    throw lastError;
  }),
);

/** Confirm held bookings, re-checking every hard rule (approval is not a reservation). */
bookingsRouter.post(
  "/projects/:id/confirm",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const p = await ownedProject(String(req.params.id), req.actor.uid);
    await requireApproval(p.id);
    const ctx = await loadContext();
    const held = ctx.bookings.filter((b) => b.projectId === p.id && b.status === "held" && occupiesSeat(b, ctx.now));
    if (!held.length) throw new HttpError(409, "No active holds. Your hold may have expired. Plan again.", "hold_expired");
    const user = ctx.users[req.actor.uid]!;
    for (const b of held) {
      const eq = ctx.equipment.find((e) => e.id === b.equipmentId)!;
      const others = { ...ctx, bookings: ctx.bookings.filter((x) => x.id !== b.id) };
      const r = checkSlot({ ...others, now: new Date(Math.min(ctx.now.getTime(), new Date(b.start).getTime())) }, { user, equipment: eq, start: new Date(b.start), end: new Date(b.end), ...(b.buddyId ? { buddyId: b.buddyId } : {}) });
      if (!r.ok) throw new HttpError(409, `Can't confirm: ${r.reason}`, r.rule);
    }
    await setBookingStatus(held.map((b) => b.id), "confirmed");
    await col(C.projects).doc(p.id).update({ status: "active" });
    res.json({ confirmed: held.map((b) => b.id) });
  }),
);

bookingsRouter.post(
  "/bookings/:id/cancel",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const b = await mustGet<Booking>(C.bookings, String(req.params.id), "Booking");
    if (b.userId !== req.actor.uid && req.actor.role !== "admin") throw forbidden();
    await setBookingStatus([b.id], "cancelled");
    res.json({ ok: true });
  }),
);

/** Kiosk check-in: valid booking now, valid certification, PPE confirmed. */
bookingsRouter.post(
  "/bookings/:id/check-in",
  requireAuth(["student"], { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const { ppeConfirmed } = z.object({ ppeConfirmed: z.literal(true, { error: "Please confirm your PPE first." }) }).parse(req.body);
    const b = await mustGet<Booking>(C.bookings, String(req.params.id), "Booking");
    if (b.userId !== req.actor.uid) throw forbidden();
    const now = new Date();
    const opensAt = new Date(new Date(b.start).getTime() - 10 * 60_000);
    if (now < opensAt || now > new Date(b.end)) throw new HttpError(409, "Check-in opens 10 minutes before your slot.", "too_early");
    if (!occupiesSeat(b, now)) throw new HttpError(409, "This booking was released (no check-in within 15 minutes).", "released");
    const ctx = await loadContext(now);
    const eq = ctx.equipment.find((e) => e.id === b.equipmentId)!;
    const cert = ctx.users[b.userId]!.certifications.find((c) => c.classId === eq.classId && new Date(c.expiresAt) > now);
    if (eq.requiresCert && !cert) throw new HttpError(403, "Your certification for this equipment isn't valid.", "certification");
    await setBookingStatus([b.id], "checked_in", { checkedInAt: now.toISOString() });
    await col(C.wellnessChecks).doc(b.id).set({ bookingId: b.id, userId: b.userId, sessionStart: now.toISOString(), lastResponseAt: null, promptedAt: null, escalated: false, ppeConfirmed });
    res.json({ ok: true, ppeConfirmed });
  }),
);

bookingsRouter.post(
  "/bookings/:id/complete",
  requireAuth(["student"], { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const b = await mustGet<Booking>(C.bookings, String(req.params.id), "Booking");
    if (b.userId !== req.actor.uid) throw forbidden();
    const now = new Date();
    await setBookingStatus([b.id], "completed");
    const bookedMin = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000;
    const actualMin = b.checkedInAt ? Math.max(0, Math.round((now.getTime() - new Date(b.checkedInAt).getTime()) / 60_000)) : 0;
    await col(C.usageEvents).add({ equipmentId: b.equipmentId, bookingId: b.id, bookedMin, actualMin: Math.min(actualMin, bookedMin), at: now.toISOString() });
    res.json({ ok: true });
  }),
);

bookingsRouter.get(
  "/bookings/mine",
  requireAuth(["student"], { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const now = new Date();
    const mine = await all<Booking>(col(C.bookings).where("userId", "==", req.actor.uid));
    const equipment = await Promise.all([...new Set(mine.map((b) => b.equipmentId))].map((id) => get<{ id: string; name: string; labId: string; bench: string }>(C.equipment, id)));
    const byId = new Map(equipment.filter(Boolean).map((e) => [e!.id, e!]));
    const items = mine
      .filter((b) => new Date(b.end) > new Date(now.getTime() - 86_400_000))
      .map((b) => ({ ...b, live: occupiesSeat(b, now), equipment: byId.get(b.equipmentId) }))
      .sort((a, b) => a.start.localeCompare(b.start));
    res.json({ items });
  }),
);
