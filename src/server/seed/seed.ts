/** Write the demo institution to Firestore (used by `npm run seed` and admin "Reset demo"). */
import { slotsIn } from "../../shared/time.js";
import { hashPin } from "../auth/pin.js";
import { lockId } from "../bookings/slotLocks.js";
import { C, col } from "../data.js";
import { db } from "../firebase.js";
import { buildDemo, DEMO_PINS } from "./demo.js";
import { staffAssessment, mergeSafety } from "../safety/guardian.js";

async function wipe(name: (typeof C)[keyof typeof C]) {
  const snap = await col(name).limit(400).get();
  if (snap.empty) return;
  const batch = db().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === 400) await wipe(name);
}

async function writeAll(name: (typeof C)[keyof typeof C], docs: ({ id?: string } & object)[]) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    for (const d of docs.slice(i, i + 400)) {
      const { id, ...data } = d as { id?: string } & Record<string, unknown>;
      batch.set(id ? col(name).doc(id) : col(name).doc(), data);
    }
    await batch.commit();
  }
}

export async function seedDemo(now = new Date()) {
  const demo = buildDemo(now);
  await Promise.all(Object.values(C).map(wipe));

  const pinHashes = Object.fromEntries(await Promise.all(Object.entries(DEMO_PINS).map(async ([role, pin]) => [role, await hashPin(pin)])));
  const users = demo.users.map((u) => (u.role in pinHashes ? { ...u, pinHash: pinHashes[u.role] } : u));

  const bookings = demo.bookings.map((b) => ({
    ...b,
    lockIds: ["confirmed", "checked_in", "held"].includes(b.status) ? slotsIn(new Date(b.start), new Date(b.end)).map((s) => lockId(b.equipmentId, s, b.seat)) : [],
  }));
  const locks = bookings.flatMap((b) => b.lockIds.map((id) => ({ id, bookingId: b.id, status: b.status, start: b.start, ...(b.checkedInAt ? { checkedInAt: b.checkedInAt } : {}) })));
  const hazardChecks = demo.projects.map((p) => {
    const staff = staffAssessment(p.tasks, p.description);
    return { id: p.id, projectId: p.id, staff, ai: null, aiSource: "fallback", merged: mergeSafety(staff, null), acknowledgedAt: p.status === "planned" ? null : now.toISOString(), reviewedBy: p.status === "approved" ? "u-rao" : null };
  });

  await Promise.all([
    writeAll(C.departments, demo.departments),
    writeAll(C.labs, demo.labs),
    writeAll(C.equipment, demo.equipment),
    writeAll(C.users, users),
    writeAll(C.cards, demo.cards),
    writeAll(C.projects, demo.projects),
    writeAll(C.requests, demo.requests),
    writeAll(C.bookings, bookings),
    writeAll(C.slotLocks, locks),
    writeAll(C.usageEvents, demo.usageEvents),
    writeAll(C.equivalences, demo.equivalences),
    writeAll(C.nearMisses, demo.nearMisses),
    writeAll(C.hazardChecks, hazardChecks),
  ]);
  return { users: users.length, equipment: demo.equipment.length, projects: demo.projects.length, bookings: bookings.length };
}
