/**
 * Layer 3: fair allocation of a contested slot, with a full decision record.
 * Gemini never decides. It only explains the stored record afterwards (ai/explain.ts).
 */
import type { Alternative, Booking, Decision, DecisionCandidate, Equipment, Project, ScoreBreakdown, User } from "../../shared/domain.js";
import { addMinutes, SLOT_MIN } from "../../shared/time.js";
import { areEquivalent, type EngineContext } from "./context.js";
import { checkSlot, freeSeat } from "./hardRules.js";
import { POLICY } from "./policy.js";
import { candidateUnits } from "./scheduler.js";

export interface Contender {
  user: User;
  project: Project;
  taskId: string;
  /** True when this slot is the last unresolved step of the project. */
  fullyUnblocks: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Score one contender for a unit. Each factor is shown to students in the decision card. */
export function scoreContender(ctx: EngineContext, c: Contender, eq: Equipment): ScoreBreakdown {
  const w = POLICY.weights;
  const verified = c.project.verifiedBy ? 1 : POLICY.unverifiedFactor;
  const daysLeft = (new Date(c.project.deadline).getTime() - ctx.now.getTime()) / 86_400_000;
  const deadline = w.deadline * clamp01(1 - daysLeft / POLICY.deadlineHorizonDays) * verified;
  const stage = w.stage * (POLICY.stageScore[c.project.stage] ?? 0.25) * verified;
  const usage = w.usage * (1 - clamp01(c.user.recentUsageHours / POLICY.usageCapHours));
  const waitedH = c.project.requestedAt ? (ctx.now.getTime() - new Date(c.project.requestedAt).getTime()) / 3_600_000 : 0;
  const wait = w.wait * clamp01(waitedH / POLICY.waitCapHours);
  const task = c.project.tasks.find((t) => t.id === c.taskId);
  const fitKind =
    !task || eq.classId === task.classId
      ? "exact"
      : ctx.equipment.some((e) => e.classId === task.classId && areEquivalent(ctx, e.id, eq.id))
        ? "equivalent"
        : "alternative";
  const fit = w.fit * POLICY.fit[fitKind];
  const unblocks = c.fullyUnblocks ? POLICY.unblocksBonus : 0;
  const noShowPenalty = -Math.min(POLICY.noShowPenaltyMax, c.user.noShowCount * POLICY.noShowPenaltyPer);
  const parts = { deadline, stage, usage, wait, fit, unblocks, noShowPenalty };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return {
    deadline: round1(deadline),
    stage: round1(stage),
    usage: round1(usage),
    wait: round1(wait),
    fit: round1(fit),
    unblocks: round1(unblocks),
    noShowPenalty: round1(noShowPenalty),
    total: round1(total),
  };
}

/**
 * Resolve who gets [start, end) on a unit. Ineligible contenders are filtered by hard
 * rules (and recorded as such). Ties break on user id, so the result is deterministic.
 * Losers get alternatives in the policy order: shared seat, same model elsewhere,
 * verified equivalent, then the nearest later slot that still meets their deadline.
 */
export function resolveConflict(
  ctx: EngineContext,
  eq: Equipment,
  start: Date,
  end: Date,
  contenders: Contender[],
  id = `dec-${eq.id}-${start.toISOString()}`,
): Decision {
  const candidates: DecisionCandidate[] = contenders.map((c) => {
    if (end > new Date(c.project.deadline))
      return { userId: c.user.id, projectId: c.project.id, eligible: false, filteredBy: "This slot ends after your deadline, so it can't help this project." };
    const r = checkSlot(ctx, { user: c.user, equipment: eq, start, end });
    if (!r.ok) return { userId: c.user.id, projectId: c.project.id, eligible: false, filteredBy: r.reason };
    return { userId: c.user.id, projectId: c.project.id, eligible: true, scores: scoreContender(ctx, c, eq) };
  });
  const ranked = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.scores!.total - a.scores!.total || a.userId.localeCompare(b.userId));

  const seats = Math.max(0, countFreeSeats(ctx, eq, start, end));
  const winners = ranked.slice(0, Math.max(1, Math.min(seats, ranked.length)));
  const winnerUserId = winners[0]?.userId ?? null;

  const alternatives: Record<string, Alternative[]> = {};
  for (const c of contenders) {
    if (winners.some((w) => w.userId === c.user.id)) continue;
    alternatives[c.user.id] = findAlternatives(ctx, c, eq, start, end);
  }

  return {
    id,
    equipmentId: eq.id,
    start: start.toISOString(),
    end: end.toISOString(),
    candidates,
    winnerUserId,
    alternatives,
    policyVersion: POLICY.version,
    explanation: templateExplanation(candidates, winnerUserId, ctx),
    explanationSource: "template",
    createdAt: ctx.now.toISOString(),
  };
}

function countFreeSeats(ctx: EngineContext, eq: Equipment, start: Date, end: Date): number {
  let n = 0;
  const fake: Booking[] = [];
  for (let s = 0; s < eq.capacity; s++) {
    const seat = freeSeat(ctx, eq, start, end, fake);
    if (seat < 0) break;
    fake.push({ id: `f${s}`, projectId: "", taskId: "", equipmentId: eq.id, userId: "", start: start.toISOString(), end: end.toISOString(), seat, status: "confirmed", checkedInAt: start.toISOString() });
    n++;
  }
  return n;
}

function findAlternatives(ctx: EngineContext, c: Contender, eq: Equipment, start: Date, end: Date): Alternative[] {
  const out: Alternative[] = [];
  const task = c.project.tasks.find((t) => t.id === c.taskId);
  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  const ok = (unit: Equipment, s: Date, e: Date) => checkSlot(ctx, { user: c.user, equipment: unit, start: s, end: e }).ok;

  if (eq.capacity > 1) out.push({ kind: "shared", equipmentId: eq.id, start: start.toISOString(), end: end.toISOString(), note: `Share ${eq.name} if both of you agree (it seats ${eq.capacity}).` });

  for (const other of ctx.equipment) {
    if (other.id === eq.id || out.length >= 3) continue;
    if (other.model === eq.model && ok(other, start, end))
      out.push({ kind: "same_model_other_lab", equipmentId: other.id, start: start.toISOString(), end: end.toISOString(), note: `Same model, free at the same time: ${other.name}.` });
    else if (areEquivalent(ctx, eq.id, other.id) && ok(other, start, end))
      out.push({ kind: "equivalent", equipmentId: other.id, start: start.toISOString(), end: end.toISOString(), note: `Verified equivalent: ${other.name}.` });
  }

  if (task) {
    const deadline = new Date(c.project.deadline);
    const units = candidateUnits(ctx, task).map((u) => u.eq);
    outer: for (let t = addMinutes(start, SLOT_MIN); addMinutes(t, durationMin) <= deadline && t < addMinutes(start, 7 * 1440); t = addMinutes(t, SLOT_MIN)) {
      for (const u of units) {
        const e = addMinutes(t, durationMin);
        if (ok(u, t, e)) {
          out.push({ kind: "later_slot", equipmentId: u.id, start: t.toISOString(), end: e.toISOString(), note: `Nearest slot that still keeps your deadline: ${u.name}.` });
          break outer;
        }
      }
    }
  }
  return out;
}

const FACTOR_WORDS: Record<string, string> = {
  deadline: "a closer, faculty-verified deadline",
  stage: "a later project stage",
  usage: "less recent lab time",
  wait: "a longer wait",
  fit: "a better equipment fit",
  unblocks: "this slot unblocking the whole project",
};

/** Deterministic plain-language explanation (also the AI fallback). */
export function templateExplanation(candidates: DecisionCandidate[], winnerUserId: string | null, ctx: EngineContext): string {
  if (!winnerUserId) return "Nobody could take this slot under the lab's safety and access rules.";
  const win = candidates.find((c) => c.userId === winnerUserId)!;
  const others = candidates.filter((c) => c.eligible && c.userId !== winnerUserId);
  const name = ctx.users[winnerUserId]?.name ?? "The winner";
  if (!others.length) return `${name} was the only eligible request for this slot.`;
  const runnerUp = others.sort((a, b) => b.scores!.total - a.scores!.total)[0]!;
  const diffs = (Object.keys(FACTOR_WORDS) as (keyof typeof FACTOR_WORDS)[])
    .map((k) => ({ k, d: (win.scores![k as keyof ScoreBreakdown] as number) - (runnerUp.scores![k as keyof ScoreBreakdown] as number) }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d)
    .slice(0, 2)
    .map((x) => FACTOR_WORDS[x.k]);
  const why = diffs.length ? diffs.join(" and ") : "a narrowly higher overall score";
  return `${name} got this slot mainly because of ${why} (score ${win.scores!.total} vs ${runnerUp.scores!.total}). Everyone else was offered alternatives.`;
}

/** Gini coefficient of a distribution (0 = perfectly equal). Used for fairness reporting. */
export function gini(values: number[]): number {
  const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  const weighted = xs.reduce((acc, x, i) => acc + (i + 1) * x, 0);
  return Math.round(((2 * weighted) / (n * sum) - (n + 1) / n) * 1000) / 1000;
}
