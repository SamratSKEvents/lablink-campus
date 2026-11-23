/**
 * Double-booking prevention.
 *
 * Each 15-minute slot of each seat has one lock document:
 *   slotLocks/{equipmentId}_{YYYYMMDDHHmm}_{seat}
 * A project's whole bundle (every task, every slot) is acquired in ONE transaction:
 * if any lock is taken, nothing is reserved. Expired holds and no-shows are treated as
 * free inside the transaction (lazy expiry), so correctness never depends on a cron job.
 *
 * ponytail: the 15-minute buffer is enforced by the engine before locking, not by locks;
 * a race on two *adjacent* bookings can shave the buffer, never double-book a seat.
 */
import { randomUUID } from "node:crypto";
import type { Booking } from "../../shared/domain.js";
import { slotKey, slotsIn } from "../../shared/time.js";
import { occupiesSeat } from "../allocation/context.js";
import { POLICY } from "../allocation/policy.js";
import type { Placement } from "../allocation/scheduler.js";
import { C, col } from "../data.js";
import { db } from "../firebase.js";
import { HttpError } from "../middleware/errors.js";

interface Lock {
  bookingId: string;
  status: Booking["status"];
  start: string;
  expiresAt?: string;
  checkedInAt?: string;
}

export const lockId = (equipmentId: string, slot: Date, seat: number) => `${equipmentId}_${slotKey(slot)}_${seat}`;

function lockIdsFor(p: { equipmentId: string; start: string; end: string; seat: number }): string[] {
  return slotsIn(new Date(p.start), new Date(p.end)).map((s) => lockId(p.equipmentId, s, p.seat));
}

function lockIsFree(l: Lock | undefined, now: Date): boolean {
  if (!l) return true;
  return !occupiesSeat({ id: l.bookingId, projectId: "", taskId: "", equipmentId: "", userId: "", start: l.start, end: l.start, seat: 0, status: l.status, expiresAt: l.expiresAt, checkedInAt: l.checkedInAt }, now);
}

export class SlotTakenError extends HttpError {
  constructor() {
    super(409, "Someone just took one of those slots. We've re-planned. Please try again.", "slot_taken");
  }
}

/**
 * Atomically hold every placement of a bundle. Idempotent per (user, key):
 * repeating a request returns the original bookings instead of booking twice.
 */
export async function holdBundle(args: {
  userId: string;
  projectId: string;
  placements: Placement[];
  idempotencyKey: string;
  now?: Date;
  buddyId?: string;
}): Promise<{ bookings: Booking[]; replayed: boolean }> {
  const now = args.now ?? new Date();
  const lockIds = args.placements.flatMap(lockIdsFor);
  if (lockIds.length > POLICY.maxLocksPerBundle) throw new HttpError(422, "This plan is too large to book at once. Book it in parts.", "bundle_too_large");
  const idemRef = col(C.idempotency).doc(`${args.userId}_${args.idempotencyKey}`);
  const expiresAt = new Date(now.getTime() + POLICY.holdExpiryMin * 60_000).toISOString();

  return db().runTransaction(async (tx) => {
    const idem = await tx.get(idemRef);
    if (idem.exists) {
      const ids = (idem.data()!.bookingIds as string[]) ?? [];
      const snaps = ids.length ? await tx.getAll(...ids.map((id) => col(C.bookings).doc(id))) : [];
      return { bookings: snaps.map((s) => ({ id: s.id, ...s.data() }) as Booking), replayed: true };
    }
    const refs = lockIds.map((id) => col(C.slotLocks).doc(id));
    const snaps = refs.length ? await tx.getAll(...refs) : [];
    if (snaps.some((s) => !lockIsFree(s.exists ? (s.data() as Lock) : undefined, now))) throw new SlotTakenError();

    const bookings: Booking[] = args.placements.map((p) => {
      const ref = col(C.bookings).doc();
      const b: Booking & { lockIds: string[]; createdAt: string } = {
        id: ref.id,
        projectId: args.projectId,
        taskId: p.taskId,
        equipmentId: p.equipmentId,
        userId: args.userId,
        start: p.start,
        end: p.end,
        seat: p.seat,
        status: "held",
        expiresAt,
        ...(args.buddyId ? { buddyId: args.buddyId } : {}),
        lockIds: lockIdsFor(p),
        createdAt: now.toISOString(),
      };
      const { id: _id, ...data } = b;
      tx.set(ref, data);
      for (const lid of b.lockIds) tx.set(col(C.slotLocks).doc(lid), { bookingId: ref.id, status: "held", start: p.start, expiresAt } satisfies Lock);
      return b;
    });
    tx.set(idemRef, { bookingIds: bookings.map((b) => b.id), at: now.toISOString() });
    return { bookings, replayed: false };
  });
}

/** Move a user's held bookings to confirmed (after re-checking rules in the route). */
export async function setBookingStatus(bookingIds: string[], status: Booking["status"], extra: Partial<Booking> = {}, now = new Date()) {
  await db().runTransaction(async (tx) => {
    const snaps = await tx.getAll(...bookingIds.map((id) => col(C.bookings).doc(id)));
    for (const s of snaps) {
      if (!s.exists) continue;
      const b = s.data() as Booking & { lockIds: string[] };
      if (b.status === "held" && b.expiresAt && new Date(b.expiresAt) <= now && status === "confirmed")
        throw new HttpError(409, "Your hold expired. Please plan again.", "hold_expired");
      tx.update(s.ref, { status, ...extra, ...(status === "confirmed" ? { expiresAt: null } : {}) });
      const release = ["cancelled", "released", "no_show", "completed"].includes(status);
      for (const lid of b.lockIds ?? []) {
        const ref = col(C.slotLocks).doc(lid);
        if (release) tx.delete(ref);
        else tx.set(ref, { bookingId: s.id, status, start: b.start, ...(extra.checkedInAt ? { checkedInAt: extra.checkedInAt } : {}) }, { merge: false });
      }
    }
  });
}

/** Bookings created earlier with this idempotency key, or null (checked before re-planning). */
export async function replayIdempotent(userId: string, key: string): Promise<Booking[] | null> {
  const idem = await col(C.idempotency).doc(`${userId}_${key}`).get();
  if (!idem.exists) return null;
  const ids = (idem.data()!.bookingIds as string[]) ?? [];
  const snaps = ids.length ? await db().getAll(...ids.map((id) => col(C.bookings).doc(id))) : [];
  return snaps.map((s) => ({ id: s.id, ...s.data() }) as Booking);
}

export const newIdempotencyKey = () => randomUUID();
