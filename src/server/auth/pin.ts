/** Staff PINs: bcrypt-hashed, 5 wrong attempts lock the account for 15 minutes. */
import bcrypt from "bcryptjs";

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MIN = 15;

export interface PinState {
  pinFailures: number;
  pinLockedUntil: string | null;
}

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);

export type PinOutcome =
  | { ok: true; next: PinState }
  | { ok: false; reason: "locked" | "wrong"; next: PinState; retryAt?: string };

/** Pure lockout state machine around a bcrypt comparison. */
export async function attemptPin(pin: string, hash: string | undefined, state: PinState, now: Date): Promise<PinOutcome> {
  if (state.pinLockedUntil && new Date(state.pinLockedUntil) > now)
    return { ok: false, reason: "locked", next: state, retryAt: state.pinLockedUntil };
  const match = hash ? await bcrypt.compare(pin, hash) : false;
  if (match) return { ok: true, next: { pinFailures: 0, pinLockedUntil: null } };
  const failures = (state.pinLockedUntil ? 0 : state.pinFailures) + 1;
  if (failures >= PIN_MAX_FAILURES) {
    const until = new Date(now.getTime() + PIN_LOCK_MIN * 60_000).toISOString();
    return { ok: false, reason: "locked", next: { pinFailures: 0, pinLockedUntil: until }, retryAt: until };
  }
  return { ok: false, reason: "wrong", next: { pinFailures: failures, pinLockedUntil: null } };
}
