/**
 * Rescue Mode and what-if analysis: re-running Layer 2 when the world changes.
 */
import type { Booking, Project } from "../../shared/domain.js";
import { occupiesSeat, type EngineContext } from "./context.js";
import { scheduleProject, type Placement, type ScheduleResult } from "./scheduler.js";

export interface RescueProposal {
  projectId: string;
  /** Bookings that must move: on the failed unit, plus later tasks that depend on them. */
  affectedBookingIds: string[];
  result: ScheduleResult;
  moves: { taskId: string; fromEquipmentId: string | null; to: Placement }[];
  /** True when the recovery uses a different equipment class: faculty must confirm it. */
  needsApproval: boolean;
}

/** Every task that (transitively) depends on any of `taskIds`, including them. */
export function downstreamTasks(project: Project, taskIds: string[]): Set<string> {
  const out = new Set(taskIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of project.tasks)
      if (!out.has(t.id) && t.dependsOn.some((d) => out.has(d))) {
        out.add(t.id);
        grew = true;
      }
  }
  return out;
}

/**
 * Plan recovery for every project with future bookings on a failed unit.
 * Unaffected bookings stay fixed. Affected tasks are rescheduled away from the unit.
 */
export function planRescue(ctx: EngineContext, failedEquipmentId: string, projects: Project[]): RescueProposal[] {
  const live = ctx.bookings.filter((b) => occupiesSeat(b, ctx.now) && new Date(b.end) > ctx.now);
  const hit = live.filter((b) => b.equipmentId === failedEquipmentId);
  const byProject = new Map<string, Booking[]>();
  for (const b of hit) byProject.set(b.projectId, [...(byProject.get(b.projectId) ?? []), b]);

  const proposals: RescueProposal[] = [];
  for (const [projectId, broken] of byProject) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) continue;
    const affected = downstreamTasks(project, broken.map((b) => b.taskId));
    const mine = live.filter((b) => b.projectId === projectId);
    const affectedBookings = mine.filter((b) => affected.has(b.taskId));
    const fixed: Placement[] = mine
      .filter((b) => !affected.has(b.taskId))
      .map((b) => ({ taskId: b.taskId, equipmentId: b.equipmentId, start: b.start, end: b.end, seat: b.seat, fit: "exact" }));
    // The project's own affected bookings are being replaced, so they must not block themselves.
    const freed: EngineContext = { ...ctx, bookings: ctx.bookings.filter((b) => !affectedBookings.some((a) => a.id === b.id)) };
    // Unbooked tasks are (re)planned too, so dependencies always resolve.
    const result = scheduleProject(freed, project, { excludeEquipment: [failedEquipmentId], fixed });
    const moves = result.placements.map((p) => ({
      taskId: p.taskId,
      fromEquipmentId: affectedBookings.find((b) => b.taskId === p.taskId)?.equipmentId ?? null,
      to: p,
    }));
    proposals.push({
      projectId,
      affectedBookingIds: affectedBookings.map((b) => b.id),
      result,
      moves,
      needsApproval: result.placements.some((p) => p.fit !== "exact"),
    });
  }
  return proposals;
}

export interface WhatIfResult {
  projectId: string;
  before: string | null;
  after: string | null;
  slipMinutes: number;
  missesDeadline: boolean;
  status: ScheduleResult["status"];
}

/**
 * "What if B gets this slot instead of A?" Give B the slot (as a confirmed booking), then
 * reschedule A's project and report how far each project's finish moves.
 */
export function whatIf(
  ctx: EngineContext,
  slot: { equipmentId: string; start: string; end: string; seat: number },
  winner: Project,
  loser: Project,
): WhatIfResult[] {
  const before = scheduleProject(ctx, loser);
  const forced: Booking = {
    id: "what-if",
    projectId: winner.id,
    taskId: "what-if",
    equipmentId: slot.equipmentId,
    userId: winner.ownerId,
    start: slot.start,
    end: slot.end,
    seat: slot.seat,
    status: "confirmed",
    checkedInAt: slot.start,
  };
  const after = scheduleProject({ ...ctx, bookings: [...ctx.bookings, forced] }, loser);
  const slip = before.finish && after.finish ? (new Date(after.finish).getTime() - new Date(before.finish).getTime()) / 60_000 : 0;
  return [
    {
      projectId: loser.id,
      before: before.finish,
      after: after.finish,
      slipMinutes: Math.max(0, Math.round(slip)),
      missesDeadline: after.status !== "feasible",
      status: after.status,
    },
  ];
}
