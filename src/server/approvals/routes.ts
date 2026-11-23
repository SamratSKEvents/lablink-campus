/**
 * Faculty approvals. Approval grants *permission* to use resources for a project;
 * it is not a reservation (everything is re-checked at booking). The AI copilot
 * only summarises and suggests. A human decides, and every rejection needs a reason.
 */
import { Router } from "express";
import { decisionSchema, type Project } from "../../shared/domain.js";
import { approvalCopilot } from "../ai/uses.js";
import { verifyStaffPin } from "../auth/routes.js";
import { all, C, col, mustGet, notify, publicUser, type AccessRequest, type StoredUser } from "../data.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle, HttpError } from "../middleware/errors.js";

export const approvalsRouter = Router();

approvalsRouter.get(
  "/approvals",
  requireAuth(["faculty", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const q = col(C.requests).where("status", "==", "pending");
    const pending = await all<AccessRequest>(req.actor.role === "admin" ? q : q.where("departmentId", "==", req.actor.departmentId));
    const items = await Promise.all(
      pending.map(async (r) => {
        const project = await mustGet<Project>(C.projects, r.projectId, "Project");
        const owner = await mustGet<StoredUser>(C.users, r.ownerId, "Student");
        const copilot = await approvalCopilot(project, publicUser(owner), r.safetyLevel);
        return { request: r, project, owner: publicUser(owner), copilot: copilot.data, copilotSource: copilot.source };
      }),
    );
    res.json({ items: items.sort((a, b) => a.project.deadline.localeCompare(b.project.deadline)) });
  }),
);

approvalsRouter.post(
  "/approvals/:requestId",
  requireAuth(["faculty", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const input = decisionSchema.parse(req.body);
    await verifyStaffPin(req.actor.uid, input.pin);
    const request = await mustGet<AccessRequest>(C.requests, String(req.params.requestId), "Request");
    if (req.actor.role !== "admin" && request.departmentId !== req.actor.departmentId) throw forbidden();
    if (request.status !== "pending") throw new HttpError(409, "This request has already been decided.", "decided");
    if (input.decision === "reject" && !input.reason?.trim()) throw new HttpError(400, "Please give the student a reason.", "reason_required");

    const at = new Date().toISOString();
    const approvals = [...request.approvals, { approverId: req.actor.uid, decision: input.decision, ...(input.reason ? { reason: input.reason } : {}), at }];
    const status = input.decision === "approve" ? "approved" : "rejected";
    await col(C.requests).doc(request.id).update({ approvals, status });
    const projectUpdate: Record<string, unknown> = { status: status === "approved" ? "approved" : "planned" };
    // Faculty verification of deadline and stage feeds the fairness score at full weight.
    if (input.verifyDeadlineAndStage && status === "approved") projectUpdate.verifiedBy = req.actor.uid;
    await col(C.projects).doc(request.projectId).update(projectUpdate);
    if (request.reviewRequired && status === "approved") await col(C.hazardChecks).doc(request.projectId).set({ reviewedBy: req.actor.uid }, { merge: true });

    await notify(
      [request.ownerId],
      status === "approved" ? "Your project was approved. You can book it now." : `Your request needs changes: ${input.reason}`,
      status === "approved" ? "success" : "warning",
      `/projects/${request.projectId}`,
    );
    res.json({ ok: true, status });
  }),
);
