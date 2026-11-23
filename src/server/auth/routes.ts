/**
 * Sign-in with a college ID card: verify signature → active card + version → user →
 * Firebase custom token (role claims). The client exchanges it for an ID token.
 */
import { Router } from "express";
import { z } from "zod";
import { cardLoginSchema, STAFF_ROLES } from "../../shared/domain.js";
import { config } from "../config.js";
import { C, col, get, mustGet, publicUser, type Card, type StoredUser } from "../data.js";
import { auth, db } from "../firebase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { handle, HttpError } from "../middleware/errors.js";
import { authLimiter } from "../middleware/security.js";
import { verifyCardToken } from "./cardToken.js";
import { attemptPin, type PinState } from "./pin.js";

export const authRouter = Router();

const INVALID = () => new HttpError(401, "That card wasn't recognised. Try again, or ask the lab office.", "invalid_card");

authRouter.post(
  "/auth/card",
  authLimiter,
  handle(async (req, res) => {
    const { token, kiosk } = cardLoginSchema.extend({ kiosk: z.boolean().optional() }).parse(req.body);
    const parsed = verifyCardToken(token, config().CARD_HMAC_SECRET);
    if (!parsed) throw INVALID();
    const card = await get<Card>(C.cards, parsed.cardId);
    // Same message for every failure: no hint whether the card exists.
    if (!card || card.status !== "active" || card.cardVersion !== parsed.version) throw INVALID();
    const user = await get<StoredUser>(C.users, card.userId);
    if (!user) throw INVALID();
    const customToken = await auth().createCustomToken(user.id, {
      role: user.role,
      dept: user.departmentId,
      demo: user.demo,
      ...(kiosk ? { kiosk: true } : {}),
    });
    res.json({ customToken, user: publicUser(user), kiosk: Boolean(kiosk) });
  }),
);

authRouter.get(
  "/me",
  requireAuth(undefined, { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const user = await mustGet<StoredUser>(C.users, req.actor.uid, "Your profile");
    res.json({ user: publicUser(user), kiosk: req.actor.kiosk, isStaff: STAFF_ROLES.includes(user.role) });
  }),
);

/** Revoke a lost card: bump its version (old QR dies) and end every live session now. */
authRouter.post(
  "/cards/:cardId/revoke",
  requireAuth(["admin", "technician"]),
  handle<AuthedRequest>(async (req, res) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
    await verifyStaffPin(req.actor.uid, pin);
    const card = await mustGet<Card>(C.cards, String(req.params.cardId), "Card");
    await col(C.cards).doc(card.id).update({ cardVersion: card.cardVersion + 1 });
    await auth().revokeRefreshTokens(card.userId);
    res.json({ ok: true, newVersion: card.cardVersion + 1 });
  }),
);

/**
 * Staff actions also need the 4-digit PIN, so a staff ID card alone can't approve.
 * Lockout state is updated transactionally, so parallel guesses can't skip the counter.
 */
export async function verifyStaffPin(uid: string, pin: string, now = new Date()): Promise<void> {
  const ref = col(C.users).doc(uid);
  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(403, "Unknown staff member.", "forbidden");
    const u = snap.data() as StoredUser;
    const state: PinState = { pinFailures: u.pinFailures ?? 0, pinLockedUntil: u.pinLockedUntil ?? null };
    const r = await attemptPin(pin, u.pinHash, state, now);
    tx.update(ref, { ...r.next });
    return r;
  });
  if (!outcome.ok) {
    if (outcome.reason === "locked") throw new HttpError(423, "Too many wrong PINs. Try again in 15 minutes.", "pin_locked");
    throw new HttpError(403, "That PIN isn't right.", "pin_wrong");
  }
}
