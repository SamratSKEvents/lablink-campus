/**
 * SOS: hold 1.5 s to send (pointer, Space or Enter). Pick a type, or it auto-sends as
 * "Emergency" after 3 s. Call 112 is always the largest action. In-app alerts are
 * supplementary, and the instructions are pre-written by staff (never AI).
 * Alt+S opens it from anywhere.
 */
import { Phone, Siren } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SOS_TYPES, type SosType } from "@shared/domain";
import { SOS_INSTRUCTIONS, SOS_LABELS } from "@shared/sos";
import { post } from "../lib/api";
import { useSession } from "../lib/auth";
import { ErrorNote, Modal } from "./ui";

const HOLD_MS = 1500;
const AUTO_SEND_S = 3;

export interface SosContext {
  labId: string;
  bench?: string;
  equipmentId?: string;
}

export function SosButton({ context, compact = false }: { context: SosContext; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? "btn btn-danger btn-sm" : "btn btn-danger"}
        aria-keyshortcuts="Alt+S"
        aria-label="Emergency SOS (Alt+S)"
      >
        <Siren size={18} aria-hidden="true" /> SOS
      </button>
      <SosSheet open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}

type Phase = "hold" | "choose" | "sent";

export function SosSheet({ open, onOpenChange, context }: { open: boolean; onOpenChange: (o: boolean) => void; context: SosContext }) {
  const [title, setTitle] = useState("Emergency");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} wide>
      {/* Remounts on every open, so each emergency starts fresh. */}
      {open && <SosBody context={context} onTitle={setTitle} />}
    </Modal>
  );
}

function SosBody({ context, onTitle }: { context: SosContext; onTitle: (t: string) => void }) {
  const [phase, setPhase] = useState<Phase>("hold");
  const [type, setType] = useState<SosType>("unspecified");
  const [countdown, setCountdown] = useState(AUTO_SEND_S);
  const [result, setResult] = useState<{ notified: number; demo: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const send = useCallback(
    async (t: SosType) => {
      setType(t);
      setPhase("sent");
      onTitle(`${SOS_LABELS[t]}: help is being alerted`);
      try {
        setResult(await post<{ notified: number; demo: boolean }>("/sos", { type: t, ...context }));
      } catch (e) {
        setError(e);
      }
    },
    [context, onTitle],
  );

  // Auto-send as "Emergency" if no type is picked within 3 seconds.
  useEffect(() => {
    if (phase !== "choose") return;
    const t = window.setTimeout(() => (countdown <= 1 ? void send("unspecified") : setCountdown(countdown - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [phase, countdown, send]);

  return (
    <div className="grid gap-6">
      <a className="btn btn-primary !text-xl !py-5 w-full" href="tel:112">
        <Phone size={22} aria-hidden="true" /> Call 112
      </a>

      {phase === "hold" && (
        <div className="grid place-items-center gap-4 py-4">
          <HoldButton onComplete={() => setPhase("choose")} />
          <p className="meta text-center max-w-sm">Press and hold for 1.5 seconds to alert the technician, faculty in charge and campus security.</p>
        </div>
      )}

      {phase === "choose" && (
        <fieldset className="grid gap-3">
          <legend className="font-semibold mb-2" aria-live="assertive">
            What's happening? Sending as “Emergency” in {countdown} s.
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SOS_TYPES.filter((t) => t !== "unspecified").map((t) => (
              <button key={t} type="button" className="btn btn-soft" onClick={() => send(t)}>
                {SOS_LABELS[t]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-danger" onClick={() => send("unspecified")}>
            Send now
          </button>
        </fieldset>
      )}

      {phase === "sent" && (
        <div className="grid gap-4" role="alert">
          {result?.demo && <p className="chip tone-yellow !whitespace-normal">DEMO: no real alert was sent to campus security.</p>}
          <ErrorNote error={error} />
          {result && (
            <p className="chip tone-green !whitespace-normal">
              <span className="dot" aria-hidden="true" />
              {result.notified} responders alerted in the app.
            </p>
          )}
          <ol className="grid gap-2 list-decimal pl-5">
            {SOS_INSTRUCTIONS[type].map((s) => (
              <li key={s} className="text-lg">
                {s}
              </li>
            ))}
          </ol>
          <p className="meta">In-app alerts are supplementary. Delivery isn't guaranteed. Always call 112 in an emergency.</p>
        </div>
      )}
    </div>
  );
}

/** Interruptible hold: releasing early rewinds the ring from where it is (CSS transition, not keyframes). */
function HoldButton({ onComplete }: { onComplete: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = () => {
    if (timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onComplete();
    }, HOLD_MS);
  };
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const C = 2 * Math.PI * 76;
  return (
    <button
      type="button"
      className="sos"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancel()}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="SOS: press and hold for 1.5 seconds"
      aria-pressed={holding}
    >
      <svg className={`sos-ring ${holding ? "" : "idle"}`} viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="76" fill="none" stroke="var(--red)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={holding ? 0 : C} transform="rotate(-90 80 80)" />
      </svg>
      SOS
      <small>{holding ? "keep holding…" : "hold 1.5 s"}</small>
    </button>
  );
}

/** Convenience for pages that only know the user (defaults to their department's first lab). */
export function useDefaultSosContext(): SosContext {
  const { user } = useSession();
  return { labId: user?.departmentId === "mech" ? "lab-mech-1" : "lab-ece-1" };
}
