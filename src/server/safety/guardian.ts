/**
 * Guardian: human-centred AI safety.
 *
 * Core rule: **AI may raise caution; only a human may lower it.**
 * `mergeSafety` is a monotonic join: the result is always at least as strict as the
 * staff rules on every dimension, whatever the AI returns (or if it returns nothing).
 * Property tests in tests/safety/guardian.test.ts prove this.
 */
import { HAZARD_LEVELS, STAFF_ROLES, type HazardLevel, type Role, type Task } from "../../shared/domain.js";
import { classById } from "../../shared/catalogue.js";

export interface SafetyAssessment {
  level: HazardLevel;
  hazards: string[];
  precautions: string[];
  ppe: string[];
  reviewRequired: boolean;
}

export type AiSafetyFlags = Partial<SafetyAssessment>;

const rank = (l: HazardLevel) => HAZARD_LEVELS.indexOf(l);
export const maxLevel = (a: HazardLevel, b: HazardLevel): HazardLevel => (rank(a) >= rank(b) ? a : b);
const union = (a: string[], b: string[] = []) => [...new Set([...a, ...b].map((s) => s.trim()).filter(Boolean))];

/** Monotonic merge of staff rules with AI flags. AI can only add. */
export function mergeSafety(staff: SafetyAssessment, ai?: AiSafetyFlags | null): SafetyAssessment {
  const aiLevel = ai?.level && HAZARD_LEVELS.includes(ai.level) ? ai.level : "none";
  const level = maxLevel(staff.level, aiLevel);
  return {
    level,
    hazards: union(staff.hazards, ai?.hazards),
    precautions: union(staff.precautions, ai?.precautions),
    ppe: union(staff.ppe, ai?.ppe),
    // High risk always needs a faculty safety review; AI may request review, never waive it.
    reviewRequired: staff.reviewRequired || ai?.reviewRequired === true || level === "high",
  };
}

/** `a` is at least as strict as `b` on every dimension. */
export function atLeastAsStrict(a: SafetyAssessment, b: SafetyAssessment): boolean {
  const covers = (x: string[], y: string[]) => y.every((v) => x.includes(v.trim()) || !v.trim());
  return (
    rank(a.level) >= rank(b.level) &&
    covers(a.hazards, b.hazards) &&
    covers(a.precautions, b.precautions) &&
    covers(a.ppe, b.ppe) &&
    (a.reviewRequired || !b.reviewRequired)
  );
}

/**
 * The only way to lower a safety level: a staff member, PIN-verified, with a reason.
 * Throws for anyone else (including any AI-originated call path, which has no actor).
 */
export function humanLower(
  current: SafetyAssessment,
  actor: { role: Role; pinVerified: boolean } | null,
  next: Pick<SafetyAssessment, "level" | "reviewRequired">,
  reason: string,
): SafetyAssessment & { loweredBy: Role; reason: string } {
  if (!actor || !STAFF_ROLES.includes(actor.role) || !actor.pinVerified)
    throw new Error("Only PIN-verified staff can lower a safety level.");
  if (reason.trim().length < 10) throw new Error("Lowering a safety level needs a written reason.");
  return { ...current, ...next, loweredBy: actor.role, reason };
}

/* ------------------------------------------------------------------ */
/* Staff-maintained hazard table (seeded into Firestore `hazardRules`). */
/* ------------------------------------------------------------------ */

interface HazardRule {
  match: { classId?: string; keyword?: RegExp };
  hazards: string[];
  precautions: string[];
  ppe: string[];
  level: HazardLevel;
  reviewRequired?: boolean;
}

export const HAZARD_RULES: HazardRule[] = [
  { match: { classId: "laser-cutter" }, level: "high", hazards: ["Laser burns and fire from flammable stock"], precautions: ["Never leave a running cut unattended", "Air assist on, lid closed"], ppe: ["Laser safety glasses"] },
  { match: { classId: "cnc-mill" }, level: "high", hazards: ["Flying chips and entanglement"], precautions: ["Tie back hair, no loose sleeves", "Clamp stock before starting"], ppe: ["Safety glasses"] },
  { match: { classId: "soldering-station" }, level: "medium", hazards: ["Burns", "Flux fumes"], precautions: ["Fume extractor on", "Return iron to its stand"], ppe: ["Safety glasses"] },
  { match: { classId: "power-supply" }, level: "medium", hazards: ["Electric shock at high voltage"], precautions: ["Set current limit before connecting", "Power off before rewiring"], ppe: [] },
  { match: { classId: "fume-hood" }, level: "high", hazards: ["Chemical exposure"], precautions: ["Sash at working height", "Know the eyewash location"], ppe: ["Nitrile gloves", "Lab coat", "Splash goggles"], reviewRequired: true },
  { match: { keyword: /li-?po|lithium|18650|battery pack/i }, level: "high", hazards: ["Lithium battery fire"], precautions: ["Never charge unattended", "Charge in a LiPo-safe bag, never inside a printed enclosure"], ppe: [] },
  { match: { keyword: /resin|sla\b/i }, level: "medium", hazards: ["Uncured resin is a skin irritant"], precautions: ["Ventilate the area"], ppe: ["Nitrile gloves"] },
  { match: { keyword: /acid|solvent|etch|ferric/i }, level: "high", hazards: ["Corrosive chemicals"], precautions: ["Work in the fume hood only"], ppe: ["Splash goggles", "Nitrile gloves"], reviewRequired: true },
  { match: { keyword: /mains|230 ?v|high voltage/i }, level: "high", hazards: ["Mains voltage"], precautions: ["Supervised work only, use an isolation transformer"], ppe: [], reviewRequired: true },
];

/** Deterministic staff assessment for a set of tasks plus a free-text description. */
export function staffAssessment(tasks: Pick<Task, "classId" | "durationMin">[], description: string): SafetyAssessment {
  let out: SafetyAssessment = { level: "none", hazards: [], precautions: [], ppe: [], reviewRequired: false };
  for (const t of tasks) {
    const cls = classById(t.classId);
    if (cls) out = { ...out, level: maxLevel(out.level, cls.hazard) };
  }
  for (const r of HAZARD_RULES) {
    const hit =
      (r.match.classId && tasks.some((t) => t.classId === r.match.classId)) ||
      (r.match.keyword && r.match.keyword.test(description));
    if (hit)
      out = mergeSafety(out, { level: r.level, hazards: r.hazards, precautions: r.precautions, ppe: r.ppe, reviewRequired: r.reviewRequired });
  }
  if (tasks.some((t) => t.classId === "soldering-station" && t.durationMin >= 180))
    out = mergeSafety(out, { precautions: ["Long soldering session: fume extractor required, take a break every hour"] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Lone-worker wellness check-ins.                                     */
/* ------------------------------------------------------------------ */

export const WELLNESS = { intervalMin: 20, repromptAfterMin: 2, escalateAfterMin: 4 } as const;

export interface WellnessState {
  sessionStart: string;
  lastResponseAt: string | null;
  promptedAt: string | null;
}

/**
 * What the lone-worker monitor should do now. A missed check-in escalates to a
 * *welfare check* for the technician. It never triggers an emergency by itself,
 * because phones go flat, lock, or lose signal. Only a person starts an SOS.
 */
export function wellnessStep(s: WellnessState, now: Date): "none" | "prompt" | "reprompt" | "welfare_check" {
  const min = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 60_000;
  if (s.promptedAt && (!s.lastResponseAt || s.lastResponseAt < s.promptedAt)) {
    const since = min(s.promptedAt);
    if (since >= WELLNESS.escalateAfterMin) return "welfare_check";
    if (since >= WELLNESS.repromptAfterMin) return "reprompt";
    return "none";
  }
  const since = min(s.lastResponseAt ?? s.sessionStart);
  return since >= WELLNESS.intervalMin ? "prompt" : "none";
}
