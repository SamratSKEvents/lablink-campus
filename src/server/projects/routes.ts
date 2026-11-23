/**
 * Describe → Plan → Request. One access request per project covers every resource.
 */
import { Router } from "express";
import { confirmPlanSchema, describeProjectSchema, type Project } from "../../shared/domain.js";
import { hazardCheck, planProject, xrayCoverage } from "../ai/uses.js";
import { all, C, col, get, loadContext, mustGet, notify, type AccessRequest } from "../data.js";
import { requireAuth, type Actor, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle, HttpError } from "../middleware/errors.js";
import { aiLimiter } from "../middleware/security.js";
import { mergeSafety, staffAssessment, type SafetyAssessment } from "../safety/guardian.js";
import { topoSort } from "../allocation/scheduler.js";
import { buildPassport } from "./passport.js";

export const projectsRouter = Router();

interface HazardCheckDoc {
  projectId: string;
  staff: SafetyAssessment;
  ai: unknown;
  aiSource: string;
  merged: SafetyAssessment;
  acknowledgedAt: string | null;
  reviewedBy: string | null;
}

/** Who may see a project: owner and team, faculty/technicians of the department, admins. */
export function canSee(actor: Actor, p: Project): boolean {
  if (actor.role === "admin") return true;
  if (p.ownerId === actor.uid || p.team.includes(actor.uid)) return true;
  return (actor.role === "faculty" || actor.role === "technician") && actor.departmentId === p.departmentId;
}

/** Plan a project from a plain description (not saved until the student confirms). */
projectsRouter.post(
  "/projects/plan",
  requireAuth(["student"]),
  aiLimiter,
  handle<AuthedRequest>(async (req, res) => {
    const input = describeProjectSchema.parse(req.body);
    const plan = await planProject(input.description);
    const staff = staffAssessment(plan.data.tasks, input.description);
    const ai = await hazardCheck({ description: input.description, tasks: plan.data.tasks });
    const safety = mergeSafety(staff, ai.data);
    res.json({ plan: plan.data, source: plan.source, xray: xrayCoverage(plan.data), safety, safetySource: ai.source });
  }),
);

projectsRouter.post(
  "/projects",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = confirmPlanSchema.parse(req.body);
    const { error } = topoSort(input.tasks);
    if (error) throw new HttpError(400, error, "invalid_plan");
    if (new Date(input.deadline) <= new Date()) throw new HttpError(400, "The deadline needs to be in the future.", "invalid");
    const ref = col(C.projects).doc();
    const now = new Date().toISOString();
    const project: Project = {
      id: ref.id,
      ownerId: req.actor.uid,
      team: input.team,
      title: input.title,
      emoji: input.emoji,
      description: input.description,
      category: input.category,
      stage: input.stage,
      deadline: input.deadline,
      verifiedBy: null,
      tasks: input.tasks,
      parts: input.parts,
      status: "planned",
      createdAt: now,
      departmentId: req.actor.departmentId,
    };
    const staff = staffAssessment(input.tasks, input.description);
    const ai = await hazardCheck({ description: input.description, tasks: input.tasks });
    const { id: _id, ...data } = project;
    await ref.set(data);
    await col(C.hazardChecks).doc(ref.id).set({ projectId: ref.id, staff, ai: ai.data, aiSource: ai.source, merged: mergeSafety(staff, ai.data), acknowledgedAt: null, reviewedBy: null } satisfies HazardCheckDoc);
    res.status(201).json({ project });
  }),
);

projectsRouter.get(
  "/projects",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const a = req.actor;
    const q =
      a.role === "student"
        ? col(C.projects).where("ownerId", "==", a.uid)
        : a.role === "admin"
          ? col(C.projects)
          : col(C.projects).where("departmentId", "==", a.departmentId);
    const projects = await all<Project>(q);
    const ctx = await loadContext();
    const requests = await all<AccessRequest>(C.requests);
    const checks = await all<HazardCheckDoc & { id: string }>(C.hazardChecks);
    const rows = projects
      .sort((x, y) => x.deadline.localeCompare(y.deadline))
      .map((p) => {
        const check = checks.find((c) => c.id === p.id);
        const pass = buildPassport(ctx, p, requests.find((r) => r.projectId === p.id) ?? null, check?.merged ?? staffAssessment(p.tasks, p.description), Boolean(check?.acknowledgedAt));
        return { ...p, owner: ctx.users[p.ownerId]?.name ?? "", risk: pass.risk, riskReason: pass.riskReason, tasks: p.tasks, taskStates: pass.tasks.map((t) => t.state), approval: pass.approval.status };
      });
    res.json({ projects: rows });
  }),
);

projectsRouter.get(
  "/projects/:id",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const p = await mustGet<Project>(C.projects, String(req.params.id), "Project");
    if (!canSee(req.actor, p)) throw forbidden();
    const ctx = await loadContext();
    const request = (await all<AccessRequest>(col(C.requests).where("projectId", "==", p.id)))[0] ?? null;
    const check = await get<HazardCheckDoc>(C.hazardChecks, p.id);
    const safety = check?.merged ?? staffAssessment(p.tasks, p.description);
    const passport = buildPassport(ctx, p, request, safety, Boolean(check?.acknowledgedAt));
    res.json({ project: { ...p, owner: ctx.users[p.ownerId]?.name ?? "" }, passport, request, xray: xrayCoverage({ parts: p.parts, confidence: "high" }) });
  }),
);

projectsRouter.post(
  "/projects/:id/acknowledge-safety",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const p = await mustGet<Project>(C.projects, String(req.params.id), "Project");
    if (p.ownerId !== req.actor.uid) throw forbidden();
    await col(C.hazardChecks).doc(p.id).set({ acknowledgedAt: new Date().toISOString() }, { merge: true });
    res.json({ ok: true });
  }),
);

/** One project-based access request covering every equipment class in the plan. */
projectsRouter.post(
  "/projects/:id/request",
  requireAuth(["student"]),
  handle<AuthedRequest>(async (req, res) => {
    const p = await mustGet<Project>(C.projects, String(req.params.id), "Project");
    if (p.ownerId !== req.actor.uid) throw forbidden();
    const existing = await all<AccessRequest>(col(C.requests).where("projectId", "==", p.id));
    if (existing.some((r) => r.status !== "rejected")) throw new HttpError(409, "This project already has an open request.", "duplicate");
    const check = await get<HazardCheckDoc>(C.hazardChecks, p.id);
    const merged = check?.merged ?? staffAssessment(p.tasks, p.description);
    if (merged.level === "high" && !check?.acknowledgedAt) throw new HttpError(409, "Please read and acknowledge the safety precautions first.", "safety_ack_required");
    const ref = col(C.requests).doc();
    const now = new Date().toISOString();
    const request: Omit<AccessRequest, "id"> = {
      projectId: p.id,
      ownerId: p.ownerId,
      departmentId: p.departmentId,
      classIds: [...new Set(p.tasks.map((t) => t.classId))],
      status: "pending",
      approvals: [],
      safetyLevel: merged.level,
      reviewRequired: merged.reviewRequired,
      createdAt: now,
    };
    await ref.set(request);
    await col(C.projects).doc(p.id).update({ status: "requested", requestedAt: now });
    const faculty = await all<{ id: string }>(col(C.users).where("role", "==", "faculty").where("departmentId", "==", p.departmentId));
    await notify(faculty.map((f) => f.id), `New access request: ${p.emoji} ${p.title}`, "info", "/approvals");
    res.status(201).json({ request: { id: ref.id, ...request } });
  }),
);
