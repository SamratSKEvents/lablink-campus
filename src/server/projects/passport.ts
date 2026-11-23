/**
 * Feasibility Passport: the answer to "what's stopping my project right now?"
 * Combines bookings, prerequisites, approvals, safety and a live engine preview.
 */
import { classLabel } from "../../shared/catalogue.js";
import type { Booking, Project } from "../../shared/domain.js";
import { occupiesSeat, type EngineContext } from "../allocation/context.js";
import { deadlineRisk, scheduleProject, type Placement, type ScheduleResult } from "../allocation/scheduler.js";
import type { AccessRequest } from "../data.js";
import type { SafetyAssessment } from "../safety/guardian.js";

export type TaskState = "booked" | "held" | "planned" | "unresolved" | "done";

export interface Passport {
  risk: "on_track" | "at_risk" | "infeasible";
  riskReason: string;
  tasks: {
    id: string;
    name: string;
    classId: string;
    classLabel: string;
    durationMin: number;
    dependsOn: string[];
    state: TaskState;
    booking?: Pick<Booking, "id" | "equipmentId" | "start" | "end" | "status">;
    proposal?: Placement;
    blocker?: string;
  }[];
  prerequisites: { classId: string; classLabel: string; met: boolean; level?: string }[];
  approval: { status: AccessRequest["status"] | "not_requested"; pendingWith?: string };
  safety: SafetyAssessment & { acknowledged: boolean };
  preview: ScheduleResult;
}

export function buildPassport(
  ctx: EngineContext,
  project: Project,
  request: AccessRequest | null,
  safety: SafetyAssessment,
  acknowledged: boolean,
): Passport {
  const live = ctx.bookings.filter((b) => b.projectId === project.id && (occupiesSeat(b, ctx.now) || b.status === "completed"));
  const fixed: Placement[] = live.map((b) => ({ taskId: b.taskId, equipmentId: b.equipmentId, start: b.start, end: b.end, seat: b.seat, fit: "exact" }));
  const preview = scheduleProject({ ...ctx, bookings: ctx.bookings.filter((b) => b.projectId !== project.id || live.includes(b)) }, project, { fixed });

  const owner = ctx.users[project.ownerId];
  const needsCert = new Set(ctx.equipment.filter((e) => e.requiresCert).map((e) => e.classId));
  const classes = [...new Set(project.tasks.map((t) => t.classId))];
  const prerequisites = classes
    .filter((c) => needsCert.has(c))
    .map((c) => {
      const cert = owner?.certifications.find((x) => x.classId === c && new Date(x.expiresAt) > ctx.now);
      return { classId: c, classLabel: classLabel(c), met: Boolean(cert), level: cert?.level };
    });

  const tasks = project.tasks.map((t) => {
    const b = live.find((x) => x.taskId === t.id);
    const proposal = preview.placements.find((p) => p.taskId === t.id);
    const blocker = preview.unresolved.find((u) => u.taskId === t.id)?.reason;
    const state: TaskState = b ? (b.status === "completed" ? "done" : b.status === "held" ? "held" : "booked") : proposal ? "planned" : "unresolved";
    return {
      id: t.id,
      name: t.name,
      classId: t.classId,
      classLabel: classLabel(t.classId),
      durationMin: t.durationMin,
      dependsOn: t.dependsOn,
      state,
      ...(b ? { booking: { id: b.id, equipmentId: b.equipmentId, start: b.start, end: b.end, status: b.status } } : {}),
      ...(proposal ? { proposal } : {}),
      ...(blocker ? { blocker } : {}),
    };
  });

  const risk = deadlineRisk(preview, project.deadline);
  const firstBlocker = preview.unresolved[0];
  const riskReason =
    risk === "on_track"
      ? "Every step fits before your deadline."
      : firstBlocker
        ? firstBlocker.reason
        : "It fits, but with less than a day to spare.";

  const pendingRole = request?.status === "pending" ? "faculty" : undefined;
  return {
    risk,
    riskReason,
    tasks,
    prerequisites,
    approval: { status: request?.status ?? "not_requested", ...(pendingRole ? { pendingWith: pendingRole } : {}) },
    safety: { ...safety, acknowledged },
    preview,
  };
}
