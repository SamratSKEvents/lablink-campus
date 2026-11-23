/**
 * Fair conflict resolution: waitlist → resolve a contested slot → decision record
 * (with AI explanation) → appeal / admin override with reason → what-if.
 * Also the Finals Week simulator, which runs the real engine on a staged rush.
 */
import { Router } from "express";
import { z } from "zod";
import { overrideSchema, type Decision, type Project, type User } from "../../shared/domain.js";
import { addMinutes } from "../../shared/time.js";
import { explainDecision } from "../ai/uses.js";
import { verifyStaffPin } from "../auth/routes.js";
import { all, C, col, loadContext, mustGet, notify } from "../data.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle, HttpError } from "../middleware/errors.js";
import type { EngineContext } from "./context.js";
import { gini, resolveConflict, type Contender } from "./fairness.js";
import { freeSeat } from "./hardRules.js";
import { POLICY } from "./policy.js";
import { whatIf } from "./rescue.js";

export const allocationRouter = Router();

interface WaitEntry {
  id: string;
  equipmentId: string;
  start: string;
  end: string;
  projectId: string;
  taskId: string;
  userId: string;
  at: string;
}

const slotSchema = z.object({ equipmentId: z.string().max(40), start: z.iso.datetime(), end: z.iso.datetime() });

/** Join the waitlist for a specific contested slot. */
allocationRouter.post(
  "/waitlist",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = slotSchema.extend({ projectId: z.string().max(64), taskId: z.string().max(40) }).parse(req.body);
    const p = await mustGet<Project>(C.projects, input.projectId, "Project");
    if (p.ownerId !== req.actor.uid) throw forbidden();
    const ref = await col(C.waitlist).add({ ...input, userId: req.actor.uid, at: new Date().toISOString() });
    res.status(201).json({ id: ref.id });
  }),
);

/** Resolve everyone waiting for a slot with the fair allocator and store the decision record. */
export async function decideSlot(ctx: EngineContext, equipmentId: string, start: Date, end: Date, contenders: Contender[], id?: string): Promise<Decision> {
  const eq = ctx.equipment.find((e) => e.id === equipmentId);
  if (!eq) throw new HttpError(404, "Equipment not found.", "not_found");
  const decision = resolveConflict(ctx, eq, start, end, contenders, id);
  const ai = await explainDecision(decision, ctx.users);
  const stored: Decision = { ...decision, explanation: ai.data.explanation, explanationSource: ai.source === "fallback" ? "template" : "ai" };
  const { id: docId, ...data } = stored;
  await col(C.decisions).doc(docId).set(data);
  return stored;
}

allocationRouter.post(
  "/admin/resolve-slot",
  requireAuth(["admin", "faculty", "technician"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = slotSchema.parse(req.body);
    const ctx = await loadContext();
    const waiting = (await all<WaitEntry>(col(C.waitlist).where("equipmentId", "==", input.equipmentId))).filter((w) => w.start === input.start);
    if (!waiting.length) throw new HttpError(404, "Nobody is waiting for that slot.", "not_found");
    const contenders = await Promise.all(
      waiting.map(async (w) => ({ user: ctx.users[w.userId]!, project: await mustGet<Project>(C.projects, w.projectId), taskId: w.taskId, fullyUnblocks: false })),
    );
    const decision = await decideSlot(ctx, input.equipmentId, new Date(input.start), new Date(input.end), contenders);
    await notify(waiting.map((w) => w.userId), "A contested slot was decided. See why, and your alternatives.", "info", `/decisions/${decision.id}`);
    res.json({ decision });
  }),
);

allocationRouter.get(
  "/decisions/:id",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const d = await mustGet<Decision>(C.decisions, String(req.params.id), "Decision");
    const involved = d.candidates.some((c) => c.userId === req.actor.uid);
    if (!involved && req.actor.role === "student") throw forbidden();
    const ctx = await loadContext();
    // Students see their own scores and the winner's; other names are anonymised.
    const names = Object.fromEntries(
      d.candidates.map((c, i) => [c.userId, req.actor.role !== "student" || c.userId === req.actor.uid || c.userId === d.winnerUserId ? (ctx.users[c.userId]?.name ?? "Student") : `Student ${String.fromCharCode(65 + i)}`]),
    );
    res.json({ decision: d, names, equipment: ctx.equipment.find((e) => e.id === d.equipmentId), weights: POLICY.weights });
  }),
);

allocationRouter.post(
  "/decisions/:id/appeal",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(req.body);
    const d = await mustGet<Decision>(C.decisions, String(req.params.id), "Decision");
    if (!d.candidates.some((c) => c.userId === req.actor.uid)) throw forbidden();
    await col(C.decisions).doc(d.id).update({ appeals: [{ userId: req.actor.uid, reason, at: new Date().toISOString() }] });
    const faculty = await all<User>(col(C.users).where("role", "==", "faculty").where("departmentId", "==", req.actor.departmentId));
    await notify(faculty.map((f) => f.id), "A student appealed an allocation decision.", "warning", `/decisions/${d.id}`);
    res.json({ ok: true });
  }),
);

allocationRouter.post(
  "/decisions/:id/override",
  requireAuth(["admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = overrideSchema.parse(req.body);
    await verifyStaffPin(req.actor.uid, input.pin);
    const d = await mustGet<Decision>(C.decisions, String(req.params.id), "Decision");
    if (!d.candidates.some((c) => c.userId === input.winnerUserId && c.eligible)) throw new HttpError(400, "The new winner must be an eligible candidate.", "invalid");
    const override = { by: req.actor.uid, reason: input.reason, winnerUserId: input.winnerUserId };
    await col(C.decisions).doc(d.id).update({ override });
    res.json({ decision: { ...d, override } });
  }),
);

/** "What if this other student got the slot instead?" */
allocationRouter.post(
  "/decisions/:id/what-if",
  requireAuth(["faculty", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const { userId } = z.object({ userId: z.string().max(64) }).parse(req.body);
    const d = await mustGet<Decision>(C.decisions, String(req.params.id), "Decision");
    const alt = d.candidates.find((c) => c.userId === userId && c.eligible);
    const win = d.candidates.find((c) => c.userId === d.winnerUserId);
    if (!alt || !win) throw new HttpError(400, "Pick an eligible candidate.", "invalid");
    const ctx = await loadContext();
    const [winnerProject, altProject] = await Promise.all([mustGet<Project>(C.projects, win.projectId), mustGet<Project>(C.projects, alt.projectId)]);
    const slot = { equipmentId: d.equipmentId, start: d.start, end: d.end, seat: 0 };
    // Original winner loses the slot: how far does their project slip?
    const result = whatIf(ctx, slot, altProject, winnerProject);
    res.json({ results: result.map((r) => ({ ...r, owner: ctx.users[winnerProject.ownerId]?.name })) });
  }),
);

/**
 * Finals Week simulator: five students with real projects contend for one oscilloscope
 * slot. The real engine runs live; fairness (Gini) is reported before and after.
 */
allocationRouter.post(
  "/admin/finals-week",
  requireAuth(["admin", "faculty"]),
  handle<AuthedRequest>(async (_req, res) => {
    const ctx = await loadContext();
    const scope = ctx.equipment.find((e) => e.id === "eq-scope-1") ?? ctx.equipment.find((e) => e.classId === "oscilloscope");
    if (!scope) throw new HttpError(404, "No oscilloscope in the catalogue.", "not_found");
    const lab = ctx.labs.find((l) => l.id === scope.labId)!;
    // The first free 2-hour window from tomorrow 2 pm IST, inside staffed hours.
    const tomorrow = addMinutes(ctx.now, 1440);
    const dayStartUtc = new Date(Math.floor((tomorrow.getTime() + 330 * 60_000) / 86_400_000) * 86_400_000 - 330 * 60_000);
    let start = addMinutes(dayStartUtc, Math.max(14 * 60, lab.staffedFromMin));
    for (let i = 0; i < 96 && freeSeat(ctx, scope, start, addMinutes(start, 120)) < 0; i++) {
      start = addMinutes(start, 15);
      if ((Math.floor(start.getTime() / 60_000) + 330) % 1440 + 120 > lab.staffedToMin) start = addMinutes(dayStartUtc, 1440 + lab.staffedFromMin);
    }
    const end = addMinutes(start, 120);
    const projects = await all<Project>(col(C.projects).where("category", "==", "finals-week"));
    if (!projects.length) throw new HttpError(409, "Run 'Reset demo' to seed the Finals Week projects.", "not_seeded");
    const contenders: Contender[] = projects.map((p) => ({
      user: ctx.users[p.ownerId]!,
      project: { ...p, requestedAt: p.requestedAt },
      taskId: p.tasks.find((t) => t.classId === "oscilloscope")?.id ?? p.tasks[0]!.id,
      fullyUnblocks: p.tasks.length === 1,
    }));
    const hoursBefore = contenders.map((c) => c.user.recentUsageHours);
    const fcfsWinner = [...contenders].sort((a, b) => (a.project.requestedAt ?? "").localeCompare(b.project.requestedAt ?? ""))[0]!;
    const decision = await decideSlot(ctx, scope.id, start, end, contenders, `finals-${Date.now()}`);
    const winner = contenders.find((c) => c.user.id === decision.winnerUserId);
    const hoursAfter = contenders.map((c) => c.user.recentUsageHours + (c.user.id === decision.winnerUserId ? 2 : 0));
    const hoursFcfs = contenders.map((c) => c.user.recentUsageHours + (c.user.id === fcfsWinner.user.id ? 2 : 0));
    res.json({
      decision,
      names: Object.fromEntries(contenders.map((c) => [c.user.id, c.user.name])),
      projects: Object.fromEntries(contenders.map((c) => [c.user.id, { title: c.project.title, emoji: c.project.emoji, deadline: c.project.deadline, verified: Boolean(c.project.verifiedBy), stage: c.project.stage }])),
      equipment: { id: scope.id, name: scope.name },
      fairness: { giniBefore: gini(hoursBefore), giniLabLink: gini(hoursAfter), giniFcfs: gini(hoursFcfs), fcfsWinner: fcfsWinner.user.name, labLinkWinner: winner?.user.name ?? null },
    });
  }),
);

