/**
 * Versioned allocation policy. Every decision record stores POLICY.version so any
 * past allocation can be re-explained against the rules in force at the time.
 */
export const POLICY = {
  version: "2026.11-1",
  /** Fair-allocation weights (sum 100). Deadline and stage count fully only when faculty-verified. */
  weights: { deadline: 35, stage: 20, usage: 20, wait: 15, fit: 10 },
  /** Unverified deadline/stage contribute at this fraction (anti-gaming). */
  unverifiedFactor: 0.5,
  /** Bonus when this slot is the last thing blocking the project (it fully unblocks it). */
  unblocksBonus: 5,
  noShowPenaltyPer: 3,
  noShowPenaltyMax: 10,
  deadlineHorizonDays: 30,
  usageCapHours: 20,
  waitCapHours: 72,
  stageScore: { idea: 0.25, prototype: 0.5, testing: 0.85, final: 1 } as Record<string, number>,
  fit: { exact: 1, equivalent: 0.7, alternative: 0.5 },

  bufferMin: 15,
  holdExpiryMin: 30,
  noShowGraceMin: 15,
  weeklyCapHoursPerClass: 12,
  /** Guardian fatigue limits (hazardous classes). */
  maxDailyLabHours: 8,
  maxContinuousMin: 240,
  /** Scheduler search bounds. */
  searchHorizonDays: 21,
  backtrackDepth: 3,
  optionsPerTask: 3,
  /** Firestore transactions allow 500 writes; keep headroom. */
  maxLocksPerBundle: 400,
} as const;

export type Policy = typeof POLICY;
