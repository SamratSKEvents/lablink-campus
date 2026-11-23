import { describe, expect, it } from "vitest";
import { signCardToken, verifyCardToken } from "../../src/server/auth/cardToken.js";
import { attemptPin, hashPin, PIN_MAX_FAILURES } from "../../src/server/auth/pin.js";

const SECRET = "test-secret-do-not-use-in-prod";

describe("ID-card tokens", () => {
  it("round-trips a signed token", () => {
    const t = signCardToken("STU-0001", 1, SECRET);
    expect(t).toMatch(/^LL1\.STU-0001\.1\.[0-9a-f]{64}$/);
    expect(verifyCardToken(t, SECRET)).toEqual({ cardId: "STU-0001", version: 1 });
  });

  it("rejects a tampered card id, version or signature", () => {
    const t = signCardToken("STU-0001", 1, SECRET);
    expect(verifyCardToken(t.replace("STU-0001", "STU-0002"), SECRET)).toBeNull();
    expect(verifyCardToken(t.replace(".1.", ".2."), SECRET)).toBeNull();
    expect(verifyCardToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"), SECRET)).toBeNull();
  });

  it("rejects tokens signed with another secret, and junk input", () => {
    expect(verifyCardToken(signCardToken("STU-0001", 1, "other-secret-xxxxxxxx"), SECRET)).toBeNull();
    for (const junk of ["", "LL1", "STU-0001", "LL1.a.b.c", "LL2.STU-0001.1." + "a".repeat(64), "LL1.<script>.1." + "a".repeat(64)])
      expect(verifyCardToken(junk, SECRET)).toBeNull();
  });

  it("refuses to sign invalid ids or versions", () => {
    expect(() => signCardToken("bad id", 1, SECRET)).toThrow();
    expect(() => signCardToken("STU-1", 0, SECRET)).toThrow();
  });
});

describe("staff PIN lockout", () => {
  const now = new Date("2026-11-23T05:00:00Z");
  it("accepts the right PIN and resets failures", async () => {
    const hash = await hashPin("4321");
    expect(await attemptPin("4321", hash, { pinFailures: 3, pinLockedUntil: null }, now)).toMatchObject({ ok: true, next: { pinFailures: 0 } });
  });

  it("locks for 15 minutes after 5 wrong attempts and refuses even the right PIN while locked", async () => {
    const hash = await hashPin("4321");
    let state = { pinFailures: 0, pinLockedUntil: null as string | null };
    for (let i = 0; i < PIN_MAX_FAILURES; i++) state = (await attemptPin("0000", hash, state, now)).next;
    expect(state.pinLockedUntil).toBe(new Date(now.getTime() + 15 * 60_000).toISOString());
    expect(await attemptPin("4321", hash, state, now)).toMatchObject({ ok: false, reason: "locked" });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect((await attemptPin("4321", hash, state, later)).ok).toBe(true);
  });

  it("users without a PIN can never pass", async () => {
    expect((await attemptPin("1234", undefined, { pinFailures: 0, pinLockedUntil: null }, now)).ok).toBe(false);
  });
});
