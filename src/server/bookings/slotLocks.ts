/**
 * Double-booking prevention.
 *
 * Each 15-minute slot of each seat has one lock document:
 *   slotLocks/{equipmentId}_{YYYYMMDDHHmm}_{seat}
 * A project's whole bundle (every task, every slot) is acquired in ONE transaction:
 * if any lock is taken, nothing is reserved. Expired holds and no-shows are treated as
 * free inside the transaction (lazy expiry), so correctness never depends on a cron job.
 *
 * The engine checks the 15-minute buffer before locking. Concurrent bookings
 * for adjacent slots can shorten the buffer because it is outside the lock interval.
 */
import { ACTIVE_BOOKING_STATUSES, type Booking } from "../../shared/domain.js";
import { slotKey, slotsIn } from "../../shared/time.js";
import { occupiesSeat, type SeatOccupancy } from "../allocation/context.js";
import { POLICY } from "../allocation/policy.js";
import type { Placement } from "../allocation/scheduler.js";
import { C, col } from "../data.js";
import { db } from "../firebase.js";
import { HttpError } from "../middleware/errors.js";

interface Lock extends SeatOccupancy {
  bookingId: string;
}

type StoredBooking = Omit<Booking, "id"> & { lockIds?: string[] };

export const lockId = (equipmentId: string, slot: Date, seat: number) => `${equipmentId}_${slotKey(slot)}_${seat}`;

function lockIdsFor(p: { equipmentId: string; start: string; end: string; seat: number }): string[] {
  return slotsIn(new Date(p.start), new Date(p.end)).map((s) => lockId(p.equipmentId, s, p.seat));
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
  const bundle = args.placements.map((placement) => ({ placement, lockIds: lockIdsFor(placement) }));
  const lockIds = bundle.flatMap((item) => item.lockIds);
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
    if (snaps.some((snap) => snap.exists && occupiesSeat(snap.data() as Lock, now))) throw new SlotTakenError();

    const bookings: Booking[] = bundle.map(({ placement, lockIds }) => {
      const ref = col(C.bookings).doc();
      const b: Booking & { lockIds: string[]; createdAt: string } = {
        id: ref.id,
        projectId: args.projectId,
        taskId: placement.taskId,
        equipmentId: placement.equipmentId,
        userId: args.userId,
        start: placement.start,
        end: placement.end,
        seat: placement.seat,
        status: "held",
        expiresAt,
        ...(args.buddyId ? { buddyId: args.buddyId } : {}),
        lockIds,
        createdAt: now.toISOString(),
      };
      const { id: _id, ...data } = b;
      tx.set(ref, data);
      for (const id of lockIds) tx.set(col(C.slotLocks).doc(id), { bookingId: ref.id, status: "held", start: placement.start, expiresAt } satisfies Lock);
      return b;
    });
    tx.set(idemRef, { bookingIds: bookings.map((b) => b.id), at: now.toISOString() });
    return { bookings, replayed: false };
  });
}

/** Change booking status and update only the seat locks that the booking still owns. */
export async function setBookingStatus(
  bookingIds: string[],
  status: Exclude<Booking["status"], "held">,
  extra: Pick<Booking, "checkedInAt"> = {},
  now = new Date(),
) {
  if (!bookingIds.length) return;
  const releasesSeat = !ACTIVE_BOOKING_STATUSES.includes(status);
  await db().runTransaction(async (tx) => {
    const bookingSnapshots = await tx.getAll(...bookingIds.map((id) => col(C.bookings).doc(id)));
    const bookings = bookingSnapshots.filter((snap) => snap.exists).map((snap) => ({
      ref: snap.ref,
      booking: snap.data() as StoredBooking,
    }));
    const lockIds = new Set(bookings.flatMap(({ booking }) => booking.lockIds ?? []));
    const lockRefs = [...lockIds].map((id) => col(C.slotLocks).doc(id));
    const lockSnapshots = lockRefs.length ? await tx.getAll(...lockRefs) : [];
    const ownerByLockId = new Map(lockSnapshots.map((snap) => [snap.id, (snap.data() as Lock | undefined)?.bookingId]));

    for (const { ref, booking } of bookings) {
      if (booking.status === "held" && booking.expiresAt && new Date(booking.expiresAt) <= now && status === "confirmed") {
        throw new HttpError(409, "Your hold expired. Please plan again.", "hold_expired");
      }
      const expectedLocks = booking.lockIds ?? [];
      const ownedLocks = expectedLocks.filter((id) => ownerByLockId.get(id) === ref.id);
      if (!releasesSeat && ownedLocks.length !== expectedLocks.length) {
        throw new HttpError(409, "This booking no longer owns its time slots. Please plan again.", "booking_slots_lost");
      }

      tx.update(ref, { status, ...extra, ...(status === "confirmed" ? { expiresAt: null } : {}) });
      for (const id of ownedLocks) {
        const lockRef = col(C.slotLocks).doc(id);
        if (releasesSeat) tx.delete(lockRef);
        else tx.set(lockRef, { bookingId: ref.id, status, start: booking.start, ...extra } satisfies Lock);
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
