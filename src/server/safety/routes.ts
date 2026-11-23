/**
 * Safety: SOS, faults, incidents, Rescue Mode, certifications, tutorials,
 * lone-worker wellness, anonymous near-misses and opt-in evacuation plans.
 * SOS instructions are pre-written by staff and bundled in the app (src/shared/sos.ts);
 * the AI never writes them.
 */
import { Router } from "express";
import { z } from "zod";
import {
  certifySchema,
  EQUIPMENT_STATUSES,
  evacuationSchema,
  faultSchema,
  nearMissSchema,
  sosSchema,
  type Booking,
  type Equipment,
  type Incident,
  type Lab,
  type Project,
} from "../../shared/domain.js";
import { classLabel } from "../../shared/catalogue.js";
import { planRescue } from "../allocation/rescue.js";
import { clusterNearMisses, incidentDraft } from "../ai/uses.js";
import { verifyStaffPin } from "../auth/routes.js";
import { all, C, col, get, loadContext, mustGet, notify, type StoredUser } from "../data.js";
import { db } from "../firebase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle, HttpError } from "../middleware/errors.js";
import { holdBundle, setBookingStatus } from "../bookings/slotLocks.js";
import { wellnessStep, type WellnessState } from "./guardian.js";

export const safetyRouter = Router();

/** Mark a unit unusable and notify every affected student with a recovery proposal. */
export async function startRescue(equipmentId: string, status: Equipment["status"], why: string) {
  await col(C.equipment).doc(equipmentId).update({ status });
  const ctx = await loadContext();
  const projectIds = [...new Set(ctx.bookings.filter((b) => b.equipmentId === equipmentId).map((b) => b.projectId))];
  const projects = (await Promise.all(projectIds.map((id) => get<Project>(C.projects, id)))).filter((p): p is Project => Boolean(p));
  const proposals = planRescue(ctx, equipmentId, projects);
  for (const p of proposals) {
    const owner = projects.find((x) => x.id === p.projectId)!.ownerId;
    await notify([owner], `${why} Rescue Mode found a ${p.result.status === "feasible" ? "full" : "partial"} recovery plan for your project.`, "warning", `/projects/${p.projectId}?rescue=${equipmentId}`);
  }
  return proposals;
}

async function staffFor(labId: string) {
  const lab = await get<Lab>(C.labs, labId);
  const staff = await all<StoredUser>(col(C.users).where("departmentId", "==", lab?.departmentId ?? ""));
  const security = await all<StoredUser>(col(C.users).where("role", "==", "security"));
  return { lab, recipients: [...staff.filter((u) => u.role === "technician" || u.role === "faculty"), ...security].map((u) => u.id) };
}

/** SOS: a supplementary in-app alert (Call 112 is always the primary action). */
safetyRouter.post(
  "/sos",
  requireAuth(undefined, { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const input = sosSchema.parse(req.body);
    const now = new Date().toISOString();
    const { lab, recipients } = await staffFor(input.labId);
    if (!lab) throw new HttpError(404, "Unknown lab.", "not_found");
    const evac = await get<{ needs: string[]; instructions: string }>(C.evacuationPlans, req.actor.uid);
    const ref = col(C.incidents).doc();
    const incident: Omit<Incident, "id"> & { departmentId: string; evacuation?: unknown } = {
      type: input.type,
      userId: req.actor.uid,
      labId: input.labId,
      ...(input.bench ? { bench: input.bench } : {}),
      ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
      at: now,
      status: "active",
      log: [{ at: now, text: `SOS raised (${input.type.replace("_", " ")})` }],
      demo: req.actor.demo,
      departmentId: lab.departmentId,
      // Opt-in evacuation needs are shared with responders only while this incident is active.
      ...(evac ? { evacuation: { needs: evac.needs, instructions: evac.instructions } } : {}),
    };
    await ref.set(incident);
    await notify(recipients, `${req.actor.demo ? "DEMO: " : ""}SOS in ${lab.name}${input.bench ? `, bench ${input.bench}` : ""}: ${input.type.replace("_", " ")}`, "alert", "/incidents");
    let rescued = 0;
    if (input.equipmentId) rescued = (await startRescue(input.equipmentId, "out_of_service", "An emergency closed equipment you booked.")).length;
    res.status(201).json({ incidentId: ref.id, notified: recipients.length, rescueProposals: rescued, demo: req.actor.demo });
  }),
);

safetyRouter.post(
  "/faults",
  requireAuth(undefined, { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const input = faultSchema.parse(req.body);
    const eq = await mustGet<Equipment>(C.equipment, input.equipmentId, "Equipment");
    const now = new Date().toISOString();
    const ref = await col(C.incidents).add({ type: "fault", userId: req.actor.uid, labId: eq.labId, bench: eq.bench, equipmentId: eq.id, at: now, status: "active", log: [{ at: now, text: `Fault reported: ${input.note}` }], demo: req.actor.demo, departmentId: eq.departmentId });
    const proposals = await startRescue(eq.id, "out_of_service", `${eq.name} was reported faulty.`);
    const { recipients } = await staffFor(eq.labId);
    await notify(recipients, `Fault on ${eq.name}: ${input.note}`, "warning", "/incidents");
    res.status(201).json({ incidentId: ref.id, rescueProposals: proposals.length });
  }),
);

/** Technician changes equipment status (maintenance, calibration, back in service). */
safetyRouter.post(
  "/equipment/:id/status",
  requireAuth(["technician", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const { status, pin } = z.object({ status: z.enum(EQUIPMENT_STATUSES), pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
    await verifyStaffPin(req.actor.uid, pin);
    const eq = await mustGet<Equipment>(C.equipment, String(req.params.id), "Equipment");
    if (status === "available") {
      await col(C.equipment).doc(eq.id).update({ status });
      res.json({ ok: true, rescueProposals: [] });
      return;
    }
    const proposals = await startRescue(eq.id, status, `${eq.name} is now ${status.replace(/_/g, " ")}.`);
    res.json({ ok: true, rescueProposals: proposals });
  }),
);

/** Rescue proposal for one of my projects. */
safetyRouter.get(
  "/rescue/:equipmentId/:projectId",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const p = await mustGet<Project>(C.projects, String(req.params.projectId), "Project");
    if (p.ownerId !== req.actor.uid && req.actor.role === "student") throw forbidden();
    const ctx = await loadContext();
    const [proposal] = planRescue(ctx, String(req.params.equipmentId), [p]);
    res.json({ proposal: proposal ?? null, equipment: Object.fromEntries(ctx.equipment.map((e) => [e.id, { name: e.name, classLabel: classLabel(e.classId) }])) });
  }),
);

/** Accept a recovery plan: release the broken bookings and hold the new placements atomically. */
safetyRouter.post(
  "/rescue/:equipmentId/:projectId/accept",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const { idempotencyKey } = z.object({ idempotencyKey: z.string().uuid() }).parse(req.body);
    const p = await mustGet<Project>(C.projects, String(req.params.projectId), "Project");
    if (p.ownerId !== req.actor.uid) throw forbidden();
    const ctx = await loadContext();
    const [proposal] = planRescue(ctx, String(req.params.equipmentId), [p]);
    if (!proposal || !proposal.moves.length) throw new HttpError(409, "No recovery is possible right now. Your technician has been told.", "infeasible");
    if (proposal.needsApproval) {
      await col(C.requests).add({ projectId: p.id, ownerId: p.ownerId, departmentId: p.departmentId, classIds: [...new Set(proposal.moves.map((m) => ctx.equipment.find((e) => e.id === m.to.equipmentId)!.classId))], status: "pending", approvals: [], safetyLevel: "low", reviewRequired: false, createdAt: new Date().toISOString(), rescue: true });
    }
    if (proposal.affectedBookingIds.length) await setBookingStatus(proposal.affectedBookingIds, "released");
    const held = await holdBundle({ userId: p.ownerId, projectId: p.id, placements: proposal.moves.map((m) => m.to), idempotencyKey });
    res.json({ bookings: held.bookings, needsApproval: proposal.needsApproval, status: proposal.result.status });
  }),
);

safetyRouter.get(
  "/incidents",
  requireAuth(["technician", "faculty", "admin", "security"]),
  handle<AuthedRequest>(async (req, res) => {
    const items = await all<Incident & { departmentId: string; evacuation?: unknown }>(col(C.incidents).orderBy("at", "desc").limit(50));
    const visible = items.filter((i) => req.actor.role === "admin" || req.actor.role === "security" || i.departmentId === req.actor.departmentId);
    const ctx = await loadContext();
    res.json({
      items: visible.map((i) => ({
        ...i,
        // Evacuation needs are visible to responders only while the incident is active.
        evacuation: i.status === "active" ? i.evacuation : undefined,
        userName: ctx.users[i.userId]?.name ?? "Student",
        labName: ctx.labs.find((l) => l.id === i.labId)?.name ?? i.labId,
        equipmentName: ctx.equipment.find((e) => e.id === i.equipmentId)?.name,
      })),
    });
  }),
);

safetyRouter.post(
  "/incidents/:id/draft",
  requireAuth(["technician", "faculty", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const i = await mustGet<Incident>(C.incidents, String(req.params.id), "Incident");
    const lab = await get<Lab>(C.labs, i.labId);
    const eq = i.equipmentId ? await get<Equipment>(C.equipment, i.equipmentId) : null;
    const draft = await incidentDraft({ type: i.type, lab: lab?.name ?? i.labId, ...(i.bench ? { bench: i.bench } : {}), ...(eq ? { equipment: eq.name } : {}), log: i.log });
    await col(C.incidents).doc(i.id).update({ reportDraft: draft.data.draft });
    res.json({ draft: draft.data.draft, source: draft.source });
  }),
);

safetyRouter.post(
  "/incidents/:id/resolve",
  requireAuth(["technician", "faculty", "admin", "security"]),
  handle<AuthedRequest>(async (req, res) => {
    const { note, pin } = z.object({ note: z.string().trim().min(3).max(500), pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
    await verifyStaffPin(req.actor.uid, pin);
    const i = await mustGet<Incident>(C.incidents, String(req.params.id), "Incident");
    await col(C.incidents).doc(i.id).update({ status: "resolved", log: [...i.log, { at: new Date().toISOString(), text: `Resolved: ${note}` }] });
    res.json({ ok: true });
  }),
);

/** Certification is granted by authorised staff after hands-on training (not by tutorials). */
safetyRouter.post(
  "/certifications",
  requireAuth(["technician", "faculty"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = certifySchema.parse(req.body);
    await verifyStaffPin(req.actor.uid, input.pin);
    const user = await mustGet<StoredUser>(C.users, input.userId, "Student");
    const expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const certifications = [...user.certifications.filter((c) => c.classId !== input.classId), { classId: input.classId, level: input.level, expiresAt, grantedBy: req.actor.uid }];
    await col(C.users).doc(user.id).update({ certifications });
    await notify([user.id], `You're certified for ${classLabel(input.classId)}${input.level === "supervised" ? " (supervised)" : ""}.`, "success");
    res.json({ ok: true, expiresAt });
  }),
);

/** Finishing a 3D walkthrough marks "Tutorial completed" only. It never certifies. */
safetyRouter.post(
  "/tutorials/:classId",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const classId = z.string().max(40).parse(req.params.classId);
    const user = await mustGet<StoredUser>(C.users, req.actor.uid);
    await col(C.users).doc(user.id).update({ tutorials: [...new Set([...user.tutorials, classId])] });
    res.json({ ok: true, certified: false });
  }),
);

/**
 * Lone-worker check-in tick, called by the session screen. The server owns the state,
 * so a closed tab can't silently skip escalation the next time anyone checks.
 */
safetyRouter.post(
  "/wellness/:bookingId/tick",
  requireAuth(["student"], { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const { responded } = z.object({ responded: z.boolean().default(false) }).parse(req.body);
    const ref = col(C.wellnessChecks).doc(String(req.params.bookingId));
    const now = new Date();
    const result = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "No active session.", "not_found");
      const w = snap.data() as WellnessState & { userId: string; escalated: boolean; bookingId: string };
      if (w.userId !== req.actor.uid) throw forbidden();
      if (responded) {
        tx.update(ref, { lastResponseAt: now.toISOString(), promptedAt: null });
        return { step: "none" as const, escalate: false };
      }
      const step = wellnessStep(w, now);
      if (step === "prompt") tx.update(ref, { promptedAt: now.toISOString() });
      const escalate = step === "welfare_check" && !w.escalated;
      if (escalate) tx.update(ref, { escalated: true });
      return { step, escalate };
    });
    if (result.escalate) {
      const b = await mustGet<Booking>(C.bookings, String(req.params.bookingId));
      const eq = await mustGet<Equipment>(C.equipment, b.equipmentId);
      const { recipients } = await staffFor(eq.labId);
      const at = now.toISOString();
      await col(C.incidents).add({ type: "welfare_check", userId: b.userId, labId: eq.labId, bench: eq.bench, equipmentId: eq.id, at, status: "active", log: [{ at, text: "Missed two check-ins during a solo high-hazard session." }], demo: req.actor.demo, departmentId: eq.departmentId });
      await notify(recipients.filter(Boolean), `Welfare check requested: ${eq.name}, bench ${eq.bench}. A student missed two check-ins.`, "warning", "/incidents");
    }
    res.json({ step: result.step });
  }),
);

/** Anonymous near-miss: no user id is stored, by design. */
safetyRouter.post(
  "/near-misses",
  requireAuth(),
  handle(async (req, res) => {
    const input = nearMissSchema.parse(req.body);
    await col(C.nearMisses).add({ ...input, at: new Date().toISOString() });
    res.status(201).json({ ok: true });
  }),
);

safetyRouter.get(
  "/near-misses/clusters",
  requireAuth(["technician", "faculty", "admin"]),
  handle(async (_req, res) => {
    const reports = await all<{ id: string; labId: string; equipmentId?: string; description: string; at: string }>(col(C.nearMisses).orderBy("at", "desc").limit(100));
    const ctx = await loadContext();
    const where = (r: (typeof reports)[number]) => ctx.equipment.find((e) => e.id === r.equipmentId)?.name ?? ctx.labs.find((l) => l.id === r.labId)?.name ?? r.labId;
    const clusters = await clusterNearMisses(reports.map((r) => ({ id: r.id, where: where(r), text: r.description })));
    res.json({ clusters: clusters.data.clusters, source: clusters.source, reports: reports.map((r) => ({ id: r.id, where: where(r), description: r.description, at: r.at })) });
  }),
);

/** Opt-in Personal Emergency Evacuation Plan. The student can delete it any time. */
safetyRouter.get(
  "/evacuation",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    res.json({ plan: await get(C.evacuationPlans, req.actor.uid) });
  }),
);
safetyRouter.put(
  "/evacuation",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = evacuationSchema.parse(req.body);
    await col(C.evacuationPlans).doc(req.actor.uid).set({ userId: req.actor.uid, ...input, consentAt: new Date().toISOString() });
    res.json({ ok: true });
  }),
);
safetyRouter.delete(
  "/evacuation",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    await col(C.evacuationPlans).doc(req.actor.uid).delete();
    res.json({ ok: true });
  }),
);
