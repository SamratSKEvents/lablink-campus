/**
 * Benchmark: first-come-first-served (FCFS) vs LabLink on the same synthetic campus,
 * under the SAME hard rules (safety, certification, capacity, hours, maintenance).
 *
 *  - FCFS: requests are handled in arrival order. Each student asks for a preferred
 *    start and takes the nearest free slot at or after it, on the exact equipment type,
 *    one task after another, with no look-ahead.
 *  - LabLink: requests are handled by fair priority (verified deadline, stage, usage,
 *    wait), and each project's whole chain is placed by the Layer 2 scheduler
 *    (earliest feasible, equivalents, bounded backtracking).
 *
 * Deterministic for a given seed. Reports trade-offs honestly; tests check invariants only.
 */
import type { Booking, Equipment, Lab, Project, Stage, Task, User } from "../../shared/domain.js";
import { addMinutes, ceilToSlot, SLOT_MIN } from "../../shared/time.js";
import type { EngineContext } from "./context.js";
import { gini, scoreContender } from "./fairness.js";
import { checkSlot } from "./hardRules.js";
import { scheduleProject, topoSort } from "./scheduler.js";

/** mulberry32: tiny seeded PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  ctx: EngineContext;
  projects: Project[];
  /** Arrival order (FCFS) and each request's preferred start. */
  arrivals: { projectId: string; at: string; preferredStart: string }[];
}

export interface BenchmarkSize {
  units: number;
  students: number;
  requests: number;
  departments: number;
}

export const FULL_SIZE: BenchmarkSize = { units: 100, students: 500, requests: 1000, departments: 6 };

const CHAIN_CLASSES = ["3d-printer", "workstation", "oscilloscope", "soldering-station", "logic-analyzer", "fpga-kit", "laser-cutter", "spectrometer", "microscope", "power-supply"];

export function buildScenario(seed: number, size: BenchmarkSize): Scenario {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const now = new Date("2030-01-07T02:30:00.000Z"); // Monday 08:00 IST
  const labs: Lab[] = Array.from({ length: size.departments * 2 }, (_, i) => ({
    id: `lab-${i}`,
    name: `Lab ${i}`,
    departmentId: `d${i % size.departments}`,
    building: "B",
    openMin: 8 * 60,
    closeMin: 20 * 60,
    staffedFromMin: 9 * 60,
    staffedToMin: 18 * 60,
    map: { x: i % 4, z: Math.floor(i / 4) },
    exits: [],
    extinguisher: "",
    eyewash: "",
  }));
  const equipment: Equipment[] = Array.from({ length: size.units }, (_, i) => {
    const classId = CHAIN_CLASSES[i % CHAIN_CLASSES.length]!;
    const lab = labs[i % labs.length]!;
    return {
      id: `u${i}`,
      name: `${classId} ${i}`,
      model: `${classId}-m${i % 3}`,
      classId,
      labId: lab.id,
      departmentId: lab.departmentId,
      bench: `B${i}`,
      status: r() < 0.04 ? "maintenance" : "available",
      capacity: classId === "workstation" && r() < 0.3 ? 2 : 1,
      requiresCert: ["laser-cutter", "soldering-station"].includes(classId),
      requiresSupervision: false,
      accessible: true,
      specs: {},
      maintenanceWindows: r() < 0.1 ? [{ start: addMinutes(now, 1440 * Math.floor(r() * 5) + 120).toISOString(), end: addMinutes(now, 1440 * Math.floor(r() * 5) + 360).toISOString() }] : [],
    };
  });
  // Equivalences: same model in different labs.
  const equivalences: [string, string][] = [];
  for (const a of equipment) for (const b of equipment) if (a.id < b.id && a.model === b.model) equivalences.push([a.id, b.id]);

  const inYear = addMinutes(now, 365 * 1440).toISOString();
  const users: Record<string, User> = {};
  for (let i = 0; i < size.students; i++) {
    users[`s${i}`] = {
      id: `s${i}`,
      name: `Student ${i}`,
      role: "student",
      departmentId: `d${i % size.departments}`,
      certifications: [
        ...(r() < 0.7 ? [{ classId: "soldering-station", level: "full" as const, expiresAt: inYear, grantedBy: "t" }] : []),
        ...(r() < 0.4 ? [{ classId: "laser-cutter", level: "full" as const, expiresAt: inYear, grantedBy: "t" }] : []),
      ],
      tutorials: [],
      recentUsageHours: Math.floor(r() * 20),
      noShowCount: r() < 0.1 ? 1 : 0,
      demo: true,
    };
  }

  const stages: Stage[] = ["idea", "prototype", "testing", "final"];
  const projects: Project[] = [];
  const arrivals: Scenario["arrivals"] = [];
  for (let i = 0; i < size.requests; i++) {
    const ownerId = `s${Math.floor(r() * size.students)}`;
    const n = 1 + Math.floor(r() * 3);
    const tasks: Task[] = Array.from({ length: n }, (_, k) => ({
      id: `t${k}`,
      name: `Task ${k}`,
      classId: pick(CHAIN_CLASSES),
      durationMin: (2 + Math.floor(r() * 7)) * 15 + 30,
      dependsOn: k ? [`t${k - 1}`] : [],
    }));
    const arrive = addMinutes(now, Math.floor(r() * 2 * 1440));
    const deadline = addMinutes(arrive, (1 + Math.floor(r() * 9)) * 1440 + 9 * 60);
    projects.push({
      id: `p${i}`,
      ownerId,
      departmentId: users[ownerId]!.departmentId,
      team: [],
      title: `Project ${i}`,
      emoji: "🧪",
      description: "",
      category: "bench",
      stage: pick(stages),
      deadline: deadline.toISOString(),
      verifiedBy: r() < 0.6 ? "f" : null,
      tasks,
      parts: [],
      status: "approved",
      createdAt: arrive.toISOString(),
      requestedAt: arrive.toISOString(),
    });
    arrivals.push({ projectId: `p${i}`, at: arrive.toISOString(), preferredStart: ceilToSlot(addMinutes(arrive, 60 + Math.floor(r() * 48) * 60)).toISOString() });
  }
  arrivals.sort((a, b) => a.at.localeCompare(b.at) || a.projectId.localeCompare(b.projectId));
  return { ctx: { now, equipment, labs, bookings: [], users, equivalences }, projects, arrivals };
}

export interface StrategyResult {
  name: string;
  bookings: Booking[];
  completedOnTime: number;
  fullyPlaced: number;
  productiveUtilisation: number;
  gini: number;
  longestWaitHours: number;
  medianWaitHours: number;
  /** Bench hours spent on projects that then missed their deadline or never finished. */
  wastedHours: number;
}

function summarise(name: string, sc: Scenario, bookings: Booking[], placedProjects: Set<string>): StrategyResult {
  const byProject = new Map<string, Booking[]>();
  for (const b of bookings) byProject.set(b.projectId, [...(byProject.get(b.projectId) ?? []), b]);
  let onTime = 0;
  let wasted = 0;
  const waits: number[] = [];
  for (const p of sc.projects) {
    const bs = byProject.get(p.id) ?? [];
    const finished = placedProjects.has(p.id) && bs.every((b) => b.end <= p.deadline);
    if (finished) onTime++;
    else wasted += bs.reduce((s, b) => s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000, 0);
    if (bs.length) waits.push((Math.min(...bs.map((b) => new Date(b.start).getTime())) - new Date(p.requestedAt!).getTime()) / 3_600_000);
  }
  const hours = new Map<string, number>(Object.keys(sc.ctx.users).map((u) => [u, 0]));
  for (const b of bookings) hours.set(b.userId, hours.get(b.userId)! + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000);
  const bookedH = [...hours.values()].reduce((a, b) => a + b, 0);
  const capacityH = sc.ctx.equipment.reduce((s, e) => s + e.capacity * 12 * 14, 0);
  waits.sort((a, b) => a - b);
  return {
    name,
    bookings,
    completedOnTime: onTime,
    fullyPlaced: placedProjects.size,
    productiveUtilisation: Math.round((bookedH / capacityH) * 1000) / 1000,
    gini: gini([...hours.values()].filter((h) => h > 0)),
    longestWaitHours: Math.round((waits.at(-1) ?? 0) * 10) / 10,
    medianWaitHours: Math.round((waits[Math.floor(waits.length / 2)] ?? 0) * 10) / 10,
    wastedHours: Math.round(wasted),
  };
}

/** FCFS: arrival order, preferred start, exact class, no look-ahead or backtracking. */
export function runFcfs(sc: Scenario): StrategyResult {
  let bookings: Booking[] = [];
  const placed = new Set<string>();
  for (const a of sc.arrivals) {
    const p = sc.projects.find((x) => x.id === a.projectId)!;
    const user = sc.ctx.users[p.ownerId]!;
    const mine: Booking[] = [];
    let cursor = new Date(a.preferredStart);
    let ok = true;
    for (const t of topoSort(p.tasks).order) {
      const units = sc.ctx.equipment.filter((e) => e.classId === t.classId);
      let got: Booking | null = null;
      const limit = addMinutes(cursor, 7 * 1440);
      for (let s = cursor; !got && s < limit; s = addMinutes(s, SLOT_MIN)) {
        const e = addMinutes(s, t.durationMin);
        for (const u of units) {
          const r = checkSlot({ ...sc.ctx, bookings }, { user, equipment: u, start: s, end: e, pending: mine });
          if (r.ok) {
            got = { id: `${p.id}-${t.id}`, projectId: p.id, taskId: t.id, equipmentId: u.id, userId: user.id, start: s.toISOString(), end: e.toISOString(), seat: r.seat, status: "confirmed", checkedInAt: s.toISOString() };
            break;
          }
        }
      }
      if (!got) {
        ok = false;
        break;
      }
      mine.push(got);
      cursor = addMinutes(got.end, 15);
    }
    bookings = [...bookings, ...mine];
    if (ok) placed.add(p.id);
  }
  return summarise("First-come-first-served", sc, bookings, placed);
}

/** LabLink: fair priority order + the Layer 2 project scheduler. */
export function runLabLink(sc: Scenario): StrategyResult {
  let bookings: Booking[] = [];
  const placed = new Set<string>();
  // Requests are batched per arrival day; within a batch, highest fair priority goes first.
  const days = new Map<string, Scenario["arrivals"]>();
  for (const a of sc.arrivals) days.set(a.at.slice(0, 10), [...(days.get(a.at.slice(0, 10)) ?? []), a]);
  for (const [, batch] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const batchNow = new Date(Math.max(...batch.map((a) => new Date(a.at).getTime())));
    const ranked = batch
      .map((a) => {
        const p = sc.projects.find((x) => x.id === a.projectId)!;
        const ctx = { ...sc.ctx, now: batchNow, bookings };
        const score = scoreContender(ctx, { user: sc.ctx.users[p.ownerId]!, project: p, taskId: p.tasks[0]!.id, fullyUnblocks: p.tasks.length === 1 }, sc.ctx.equipment.find((e) => e.classId === p.tasks[0]!.classId) ?? sc.ctx.equipment[0]!).total;
        return { a, p, score };
      })
      .sort((x, y) => y.score - x.score || x.p.id.localeCompare(y.p.id));
    for (const { a, p } of ranked) {
      const ctx: EngineContext = { ...sc.ctx, now: new Date(a.at), bookings };
      const res = scheduleProject(ctx, p, { notBefore: new Date(Math.max(new Date(a.at).getTime(), batchNow.getTime())) });
      // Partial plans hold bench time without finishing anything, so in a crowded batch only feasible chains are committed.
      const mine = (res.status === "feasible" ? res.placements : []).map<Booking>((pl) => ({ id: `${p.id}-${pl.taskId}`, projectId: p.id, taskId: pl.taskId, equipmentId: pl.equipmentId, userId: p.ownerId, start: pl.start, end: pl.end, seat: pl.seat, status: "confirmed", checkedInAt: pl.start }));
      bookings = [...bookings, ...mine];
      if (res.status === "feasible") placed.add(p.id);
    }
  }
  return summarise("LabLink", sc, bookings, placed);
}

/** Invariant: no two bookings share a seat at overlapping times. */
export function countConflicts(bookings: Booking[]): number {
  let conflicts = 0;
  const byKey = new Map<string, Booking[]>();
  for (const b of bookings) byKey.set(`${b.equipmentId}#${b.seat}`, [...(byKey.get(`${b.equipmentId}#${b.seat}`) ?? []), b]);
  for (const list of byKey.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < list.length; i++) if (list[i]!.start < list[i - 1]!.end) conflicts++;
  }
  return conflicts;
}

/** Invariant: every booking passes every hard rule given all the others. */
export function countRuleViolations(sc: Scenario, bookings: Booking[]): number {
  let v = 0;
  for (const b of bookings) {
    const eq = sc.ctx.equipment.find((e) => e.id === b.equipmentId)!;
    const others = bookings.filter((x) => x.id !== b.id);
    const r = checkSlot({ ...sc.ctx, now: new Date(b.start), bookings: others }, { user: sc.ctx.users[b.userId]!, equipment: eq, start: new Date(b.start), end: new Date(b.end) });
    // Capacity is re-checked without the 15-minute buffer here (the buffer is a scheduling courtesy).
    if (!r.ok && r.rule !== "capacity" && r.rule !== "past") v++;
  }
  return v;
}
