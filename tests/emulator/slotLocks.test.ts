/**
 * Concurrency on the Firestore emulator: the double-booking guarantees in §7.6.
 * Run with `npm run test:emulator`.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { holdBundle } from "../../src/server/bookings/slotLocks.js";
import { C, col } from "../../src/server/data.js";
import { db } from "../../src/server/firebase.js";
import type { Placement } from "../../src/server/allocation/scheduler.js";

const start = "2030-01-07T05:30:00.000Z";
const end = "2030-01-07T06:30:00.000Z";
const place = (over: Partial<Placement> = {}): Placement => ({ taskId: "t1", equipmentId: "eq-x", start, end, seat: 0, fit: "exact", ...over });

async function clear() {
  for (const name of [C.slotLocks, C.bookings, C.idempotency]) {
    const snap = await col(name).get();
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

describe("slot locks (emulator)", () => {
  beforeEach(clear);

  it("20 simultaneous requests for one seat: exactly 1 succeeds", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => holdBundle({ userId: `u${i}`, projectId: `p${i}`, placements: [place()], idempotencyKey: randomUUID() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await col(C.bookings).get()).size).toBe(1);
  });

  it("capacity 3 with 5 requests: exactly 3 succeed", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => holdBundle({ userId: `u${i}`, projectId: `p${i}`, placements: [place({ seat: i % 3 })], idempotencyKey: randomUUID() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });

  it("a bundle with one blocked task is rolled back entirely", async () => {
    await holdBundle({ userId: "a", projectId: "pa", placements: [place({ equipmentId: "eq-y" })], idempotencyKey: randomUUID() });
    const bundle = [place({ taskId: "fab", equipmentId: "eq-x" }), place({ taskId: "test", equipmentId: "eq-y" })];
    await expect(holdBundle({ userId: "b", projectId: "pb", placements: bundle, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "slot_taken" });
    const locksX = await col(C.slotLocks).where("bookingId", "!=", "").get();
    expect(locksX.docs.every((d) => d.id.startsWith("eq-y"))).toBe(true);
    expect((await col(C.bookings).where("userId", "==", "b").get()).size).toBe(0);
  });

  it("an expired hold is reclaimed", async () => {
    const past = new Date("2030-01-07T00:00:00Z");
    await holdBundle({ userId: "a", projectId: "pa", placements: [place()], idempotencyKey: randomUUID(), now: past });
    const later = new Date(past.getTime() + 31 * 60_000);
    const r = await holdBundle({ userId: "b", projectId: "pb", placements: [place()], idempotencyKey: randomUUID(), now: later });
    expect(r.bookings[0]!.userId).toBe("b");
  });

  it("repeating a request with the same idempotency key creates one booking", async () => {
    const key = randomUUID();
    const first = await holdBundle({ userId: "a", projectId: "pa", placements: [place()], idempotencyKey: key });
    const again = await holdBundle({ userId: "a", projectId: "pa", placements: [place()], idempotencyKey: key });
    expect(again.replayed).toBe(true);
    expect(again.bookings.map((b) => b.id)).toEqual(first.bookings.map((b) => b.id));
    expect((await col(C.bookings).get()).size).toBe(1);
  });
});
