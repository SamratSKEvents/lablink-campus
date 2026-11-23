/** Equipment discovery: catalogue, natural-language search, live status, equivalents. */
import { Router } from "express";
import { classLabel } from "../../shared/catalogue.js";
import { searchSchema, type Booking, type Equipment, type Lab } from "../../shared/domain.js";
import { addMinutes, ceilToSlot, overlaps, SLOT_MIN } from "../../shared/time.js";
import { occupiesSeat } from "../allocation/context.js";
import { freeSeat } from "../allocation/hardRules.js";
import { explainEquivalence, parseSearch } from "../ai/uses.js";
import { all, C, col, loadContext, mustGet } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { handle } from "../middleware/errors.js";
import { aiLimiter } from "../middleware/security.js";

export const discoveryRouter = Router();

export type LiveStatus = "free" | "held" | "booked" | "maintenance" | "sos";

/** Status shown on cards, the lab map and the list view. */
export function liveStatus(eq: Equipment, bookings: Booking[], now: Date, sosEquipment: Set<string>): LiveStatus {
  if (sosEquipment.has(eq.id)) return "sos";
  if (eq.status !== "available") return "maintenance";
  const current = bookings.filter((b) => b.equipmentId === eq.id && occupiesSeat(b, now) && overlaps(new Date(b.start), new Date(b.end), now, addMinutes(now, 1)));
  if (current.length >= eq.capacity) return current.some((b) => b.status === "held") ? "held" : "booked";
  return "free";
}

async function activeSosEquipment(): Promise<Set<string>> {
  const active = await all<{ equipmentId?: string; type: string }>(col(C.incidents).where("status", "==", "active"));
  return new Set(active.filter((i) => i.type !== "welfare_check" && i.equipmentId).map((i) => i.equipmentId!));
}

discoveryRouter.get(
  "/equipment",
  requireAuth(),
  aiLimiter,
  handle(async (req, res) => {
    const { q } = searchSchema.parse(req.query);
    const ctx = await loadContext();
    const sos = await activeSosEquipment();
    const filters = q ? (await parseSearch(q)) : null;
    let list = ctx.equipment;
    if (filters) {
      const f = filters.data;
      if (f.classIds.length) list = list.filter((e) => f.classIds.includes(e.classId));
      else if (f.keywords.length) list = list.filter((e) => f.keywords.some((k) => `${e.name} ${e.model} ${classLabel(e.classId)}`.toLowerCase().includes(k)));
      if (f.accessibleOnly) list = list.filter((e) => e.accessible);
    }
    const labs = new Map(ctx.labs.map((l) => [l.id, l]));
    const items = list.map((e) => {
      const status = liveStatus(e, ctx.bookings, ctx.now, sos);
      return { ...e, manualExtract: undefined, classLabel: classLabel(e.classId), lab: labs.get(e.labId)?.name ?? "", liveStatus: status, nextFree: nextFreeSlot(e, ctx.bookings, ctx.now, labs.get(e.labId)) };
    });
    const sorted = filters?.data.availableNow ? items.sort((a, b) => Number(b.liveStatus === "free") - Number(a.liveStatus === "free")) : items;
    res.json({ items: sorted, filters: filters?.data ?? null, aiSource: filters?.source ?? null });
  }),
);

/** Next 1-hour free window within opening hours over the next 3 days (for "Free 2–4 pm" chips). */
function nextFreeSlot(eq: Equipment, bookings: Booking[], now: Date, lab?: Lab): string | null {
  if (eq.status !== "available" || !lab) return null;
  const ctx = { now, equipment: [eq], labs: [lab], bookings, users: {}, equivalences: [] };
  for (let t = ceilToSlot(now); t < addMinutes(now, 3 * 1440); t = addMinutes(t, SLOT_MIN)) {
    const m = (Math.floor(t.getTime() / 60_000) + 330) % 1440;
    if (m < lab.openMin || m + 60 > lab.closeMin) continue;
    if (freeSeat(ctx, eq, t, addMinutes(t, 60)) >= 0) return t.toISOString();
  }
  return null;
}

discoveryRouter.get(
  "/equipment/:id",
  requireAuth(),
  handle(async (req, res) => {
    const eq = await mustGet<Equipment>(C.equipment, String(req.params.id), "Equipment");
    const ctx = await loadContext();
    const sos = await activeSosEquipment();
    const ids = ctx.equivalences.filter(([a, b]) => a === eq.id || b === eq.id).map(([a, b]) => (a === eq.id ? b : a));
    const equivalents = await Promise.all(
      ctx.equipment.filter((e) => ids.includes(e.id)).map(async (e) => ({ id: e.id, name: e.name, model: e.model, ...(await explainEquivalence(eq, e)) })),
    );
    const schedule = ctx.bookings
      .filter((b) => b.equipmentId === eq.id && occupiesSeat(b, ctx.now) && new Date(b.end) > ctx.now)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 20)
      .map((b) => ({ start: b.start, end: b.end, status: b.status, seat: b.seat }));
    res.json({
      equipment: { ...eq, classLabel: classLabel(eq.classId), liveStatus: liveStatus(eq, ctx.bookings, ctx.now, sos) },
      lab: ctx.labs.find((l) => l.id === eq.labId),
      equivalents,
      schedule,
    });
  }),
);

/** Labs with unit statuses, for the 3D twin and its list fallback. */
discoveryRouter.get(
  "/labs",
  requireAuth(undefined, { kioskAllowed: true }),
  handle(async (_req, res) => {
    const ctx = await loadContext();
    const sos = await activeSosEquipment();
    res.json({
      labs: ctx.labs.map((l) => ({
        ...l,
        equipment: ctx.equipment
          .filter((e) => e.labId === l.id)
          .map((e) => ({ id: e.id, name: e.name, classId: e.classId, classLabel: classLabel(e.classId), bench: e.bench, liveStatus: liveStatus(e, ctx.bookings, ctx.now, sos) })),
      })),
    });
  }),
);
