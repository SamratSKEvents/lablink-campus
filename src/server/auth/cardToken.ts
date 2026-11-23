/**
 * Signed ID-card tokens: `LL1.<cardId>.<cardVersion>.<hex HMAC-SHA256>`.
 * The card carries no personal data. A typed or guessed roll number gets nowhere,
 * because the signature can't be forged without the server-side secret.
 * Bumping cardVersion (lost card) invalidates every old QR at once.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "LL1";
const ID_RE = /^[A-Za-z0-9-]{3,40}$/;

function mac(secret: string, cardId: string, version: number): string {
  return createHmac("sha256", secret).update(`${PREFIX}.${cardId}.${version}`).digest("hex");
}

export function signCardToken(cardId: string, version: number, secret: string): string {
  if (!ID_RE.test(cardId)) throw new Error("Invalid card id");
  if (!Number.isInteger(version) || version < 1) throw new Error("Invalid card version");
  return `${PREFIX}.${cardId}.${version}.${mac(secret, cardId, version)}`;
}

/** Returns the card id and version if the signature is valid, else null. Constant-time compare. */
export function verifyCardToken(token: string, secret: string): { cardId: string; version: number } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, cardId, v, sig] = parts as [string, string, string, string];
  const version = Number(v);
  if (!ID_RE.test(cardId) || !Number.isInteger(version) || version < 1 || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = Buffer.from(mac(secret, cardId, version), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given) ? { cardId, version } : null;
}
