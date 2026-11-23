/**
 * Layer 2: feasible project scheduling.
 *
 * Tasks form a small DAG (Fabricate → Assemble → Test). We place them in topological
 * order, each at its earliest feasible slot on any qualifying unit, before the deadline.
 * If a later task cannot fit, we backtrack: earlier tasks try their next few options.
 *
 * ponytail: greedy + bounded backtracking (optionsPerTask^backtrackDepth), not a full CP
 * solver. Fine at campus scale; swap in a CP-SAT solver if chains grow past ~10 tasks.
 */
import type { Booking, Equipment, Project, Task, User } from "../../shared/domain.js";
import { addMinutes, ceilToSlot, SLOT_MIN } from "../../shared/time.js";
import { areEquivalent, type EngineContext } from "./context.js";
import { checkSlot, type RuleId } from "./hardRules.js";
import { POLICY } from "./policy.js";

export interface Placement {
  taskId: string;
  equipmentId: string;
  start: string;
  end: string;
  seat: number;
  fit: "exact" | "equivalent" | "alternative";
}

export interface Unresolved {
  taskId: string;
  rule: RuleId | "dependency" | "deadline" | "no_equipment";
  reason: string;
}

export interface ScheduleResult {
  status: "feasible" | "partial" | "infeasible";
  placements: Placement[];
  unresolved: Unresolved[];
  /** Finish time of the last placed task (for deadline-risk and what-if). */
  finish: string | null;
}

export interface ScheduleOptions {
  /** Units that must not be used (e.g. a faulty unit during Rescue Mode). */
  excludeEquipment?: string[];
  /** Tasks already done or booked: kept fixed, and their end times satisfy dependencies. */
  fixed?: Placement[];
  /** Earliest time to consider (defaults to ctx.now). */
  notBefore?: Date;
}

/** Kahn's algorithm. Unknown deps are reported, cycles are rejected. */
export function topoSort(tasks: Task[]): { order: Task[]; error?: string } {
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks)
    for (const d of t.dependsOn) if (!ids.has(d)) return { order: [], error: `Task "${t.name}" depends on unknown "${d}".` };
  const indeg = new Map(tasks.map((t) => [t.id, t.dependsOn.length]));
  const queue = tasks.filter((t) => t.dependsOn.length === 0);
  const order: Task[] = [];
  while (queue.length) {
    const t = queue.shift()!;
    order.push(t);
    for (const n of tasks)
      if (n.dependsOn.includes(t.id)) {
        indeg.set(n.id, indeg.get(n.id)! - 1);
        if (indeg.get(n.id) === 0) queue.push(n);
      }
  }
  return order.length === tasks.length ? { order } : { order: [], error: "Task dependencies form a cycle." };
}

/** Units that can perform a task, best fit first. */
export function candidateUnits(ctx: EngineContext, task: Task, exclude: string[] = []): { eq: Equipment; fit: Placement["fit"] }[] {
  const usable = ctx.equipment.filter((e) => !exclude.includes(e.id));
  const exact = usable.filter((e) => e.classId === task.classId);
  const equivalent = usable.filter(
    (e) => e.classId !== task.classId && exact.some((x) => areEquivalent(ctx, x.id, e.id)),
  );
  const alt = usable.filter(
    (e) => (task.alternatives ?? []).includes(e.classId) && !equivalent.some((x) => x.id === e.id),
  );
  return [
    ...exact.map((eq) => ({ eq, fit: "exact" as const })),
    ...equivalent.map((eq) => ({ eq, fit: "equivalent" as const })),
    ...alt.map((eq) => ({ eq, fit: "alternative" as const })),
  ];
}

function asBooking(p: Placement, userId: string, projectId: string): Booking {
  return { id: `pending-${p.taskId}`, projectId, taskId: p.taskId, equipmentId: p.equipmentId, userId, start: p.start, end: p.end, seat: p.seat, status: "confirmed", checkedInAt: p.start };
}

/**
 * Up to `limit` earliest feasible placements for a task, scanning 15-minute steps.
 * Also returns the most informative rejection, so an unplaceable task gets a real reason.
 */
export function findOptions(
  ctx: EngineContext,
  task: Task,
  user: User,
  team: User[],
  earliest: Date,
  latestEnd: Date,
  pending: Booking[],
  exclude: string[],
  limit: number,
): { options: Placement[]; blocker?: Unresolved } {
  const units = candidateUnits(ctx, task, exclude);
  if (units.length === 0)
    return { options: [], blocker: { taskId: task.id, rule: "no_equipment", reason: `No working ${task.classId} is available right now.` } };

  const options: Placement[] = [];
  const reasons = new Map<RuleId, string>();
  const startFrom = ceilToSlot(earliest);
  for (let t = startFrom; addMinutes(t, task.durationMin) <= latestEnd && options.length < limit; t = addMinutes(t, SLOT_MIN)) {
    const end = addMinutes(t, task.durationMin);
    for (const { eq, fit } of units) {
      const r = checkSlot(ctx, { user, team, equipment: eq, start: t, end, pending });
      if (r.ok) {
        options.push({ taskId: task.id, equipmentId: eq.id, start: t.toISOString(), end: end.toISOString(), seat: r.seat, fit });
        break; // best-fit unit at this time; next option comes from a later time
      }
      if (!reasons.has(r.rule)) reasons.set(r.rule, r.reason);
    }
  }
  if (options.length) return { options };
  // Prefer the rule that is most actionable for the student.
  const priority: RuleId[] = ["certification", "self_overlap", "team_certification", "fatigue_continuous", "weekly_cap", "supervision", "lone_worker", "status", "maintenance", "capacity", "fatigue_daily", "hours", "past"];
  const rule = priority.find((r) => reasons.has(r));
  return {
    options: [],
    blocker: rule
      ? { taskId: task.id, rule, reason: reasons.get(rule)! }
      : { taskId: task.id, rule: "deadline", reason: "No slot fits before the deadline." },
  };
}

/** Schedule a whole project (Layer 2). Pure and deterministic for a given context. */
export function scheduleProject(ctx: EngineContext, project: Project, opts: ScheduleOptions = {}): ScheduleResult {
  const user = ctx.users[project.ownerId];
  if (!user) return { status: "infeasible", placements: [], unresolved: [{ taskId: "-", rule: "dependency", reason: "Unknown project owner." }], finish: null };
  const team = project.team.map((id) => ctx.users[id]).filter((u): u is User => Boolean(u));
  const { order, error } = topoSort(project.tasks);
  if (error) return { status: "infeasible", placements: [], unresolved: [{ taskId: "-", rule: "dependency", reason: error }], finish: null };

  const fixed = opts.fixed ?? [];
  const fixedIds = new Set(fixed.map((f) => f.taskId));
  const todo = order.filter((t) => !fixedIds.has(t.id));
  const exclude = opts.excludeEquipment ?? [];
  const deadline = new Date(project.deadline);
  const horizon = addMinutes(opts.notBefore ?? ctx.now, POLICY.searchHorizonDays * 1440);
  const latestEnd = deadline < horizon ? deadline : horizon;
  const notBefore = opts.notBefore ?? ctx.now;

  let best: { placements: Placement[]; unresolved: Unresolved[] } = { placements: [], unresolved: [] };

  const readyAt = (task: Task, placed: Placement[]): Date | null => {
    let t = notBefore;
    for (const d of task.dependsOn) {
      const p = placed.find((x) => x.taskId === d);
      if (!p) return null;
      const after = addMinutes(p.end, POLICY.bufferMin);
      if (after > t) t = after;
    }
    return t;
  };

  // Depth-first search with bounded branching. Returns true when every task is placed.
  const search = (i: number, placed: Placement[], depthBudget: number): boolean => {
    if (i === todo.length) {
      best = { placements: placed, unresolved: [] };
      return true;
    }
    const task = todo[i]!;
    const ready = readyAt(task, [...fixed, ...placed]);
    if (!ready) {
      recordPartial(placed, i, { taskId: task.id, rule: "dependency", reason: "An earlier step couldn't be scheduled." });
      return false;
    }
    const pending = placed.map((p) => asBooking(p, user.id, project.id));
    const limit = depthBudget > 0 ? POLICY.optionsPerTask : 1;
    const { options, blocker } = findOptions(ctx, task, user, team, ready, latestEnd, pending, exclude, limit);
    if (!options.length) {
      recordPartial(placed, i, blocker!);
      return false;
    }
    for (let k = 0; k < options.length; k++) {
      if (search(i + 1, [...placed, options[k]!], k === 0 ? depthBudget : depthBudget - 1)) return true;
    }
    return false;
  };

  // Keep the partial plan that placed the most tasks (ties: the first found, i.e. earliest).
  function recordPartial(placed: Placement[], failedAt: number, blocker: Unresolved) {
    if (best.unresolved.length && placed.length <= best.placements.length) return;
    const rest = todo.slice(failedAt + 1).map<Unresolved>((t) => ({ taskId: t.id, rule: "dependency", reason: "Waits on an unscheduled earlier step." }));
    best = { placements: placed, unresolved: [blocker, ...rest] };
  }

  search(0, [], POLICY.backtrackDepth);

  const all = [...fixed, ...best.placements];
  const finish = all.length ? all.map((p) => p.end).sort().at(-1)! : null;
  const status = best.unresolved.length === 0 ? "feasible" : best.placements.length > 0 ? "partial" : "infeasible";
  return { status, placements: best.placements, unresolved: best.unresolved, finish };
}

/** Deadline risk for the Feasibility Passport. */
export function deadlineRisk(result: ScheduleResult, deadline: string): "on_track" | "at_risk" | "infeasible" {
  if (result.status === "infeasible") return "infeasible";
  if (result.status === "partial") return "at_risk";
  if (!result.finish) return "on_track";
  const slackH = (new Date(deadline).getTime() - new Date(result.finish).getTime()) / 3_600_000;
  return slackH < 24 ? "at_risk" : "on_track";
}
