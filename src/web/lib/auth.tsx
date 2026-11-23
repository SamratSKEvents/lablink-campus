/** Session state: sign in by ID card, sign out, kiosk auto sign-out after 2 idle minutes. */
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@shared/domain";
import { api, post } from "./api";
import { firebaseAuth, setSessionPersistence } from "./firebase";

interface Session {
  user: User | null;
  kiosk: boolean;
  ready: boolean;
  signInWithCard: (token: string, kiosk?: boolean) => Promise<User>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
export const KIOSK_IDLE_MS = 2 * 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth, async (fbUser) => {
        if (!fbUser) {
          setUser(null);
          setReady(true);
          return;
        }
        try {
          const me = await api<{ user: User; kiosk: boolean }>("/me");
          setUser(me.user);
          setKiosk(me.kiosk);
        } catch {
          setUser(null);
        } finally {
          setReady(true);
        }
      }),
    [],
  );

  const signInWithCard = useCallback(async (token: string, asKiosk = false) => {
    const res = await post<{ customToken: string; user: User; kiosk: boolean }>("/auth/card", { token: token.trim(), kiosk: asKiosk });
    await setSessionPersistence(asKiosk);
    await signInWithCustomToken(firebaseAuth, res.customToken);
    setUser(res.user);
    setKiosk(res.kiosk);
    return res.user;
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(firebaseAuth);
    setUser(null);
    setKiosk(false);
  }, []);

  // Kiosk sessions end after 2 minutes without interaction.
  useEffect(() => {
    if (!kiosk || !user) return;
    let timer = window.setTimeout(signOut, KIOSK_IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(signOut, KIOSK_IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [kiosk, user, signOut]);

  const value = useMemo(() => ({ user, kiosk, ready, signInWithCard, signOut }), [user, kiosk, ready, signInWithCard, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside AuthProvider");
  return s;
}
