/**
 * Accessible building blocks on top of Base UI primitives and the LabLink tokens.
 * Status is never colour alone: every chip pairs a dot with a word.
 */
import { Dialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
import { Sparkles, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import { HeaderDoodles, Spark, TestTube } from "./Doodles";

export type Tone = "green" | "yellow" | "orange" | "red" | "blue" | "violet" | "neutral";

export function Chip({ tone, children, dot = true, className = "" }: { tone: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`chip tone-${tone} ${className}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Live status of a unit, with the same colour meaning everywhere (DESIGN.md §3). */
export const LIVE_STATUS: Record<string, { tone: Tone; label: string }> = {
  free: { tone: "green", label: "Free now" },
  held: { tone: "yellow", label: "Held" },
  booked: { tone: "orange", label: "Booked" },
  maintenance: { tone: "red", label: "Out of service" },
  sos: { tone: "red", label: "SOS" },
};

export const RISK: Record<string, { tone: Tone; label: string }> = {
  on_track: { tone: "green", label: "On track" },
  at_risk: { tone: "orange", label: "At risk" },
  infeasible: { tone: "red", label: "Blocked" },
};

export const TASK_STATE: Record<string, { tone: Tone; label: string; bar: string }> = {
  booked: { tone: "green", label: "Booked", bar: "var(--green)" },
  done: { tone: "green", label: "Done", bar: "var(--green)" },
  held: { tone: "yellow", label: "Held", bar: "var(--yellow)" },
  planned: { tone: "blue", label: "Planned", bar: "var(--blue)" },
  unresolved: { tone: "red", label: "Unresolved", bar: "var(--red)" },
};

/** Marks AI output so students never mistake it for a staff decision. */
export function AiNote({ source, children, label = "Gemini" }: { source?: string | null; children: ReactNode; label?: string }) {
  const ai = source && source !== "fallback" && source !== "template";
  return (
    <div className="ai-bubble enter" aria-live="polite">
      <b className="inline-flex items-center gap-1">
        <Sparkles size={14} aria-hidden="true" />
        {ai ? label : "Rules-based"}:
      </b>{" "}
      {children}
      {ai && <span className="meta block mt-1">Suggested by AI. A person confirms it.</span>}
    </div>
  );
}

export function Segments({ colors, label }: { colors: string[]; label: string }) {
  return (
    <div className="flex gap-1.5 my-4" role="img" aria-label={label}>
      {colors.map((c, i) => (
        <span key={i} className="flex-1 h-2 rounded-full" style={{ background: c }} />
      ))}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Bubbling flask: the app's loading state. Announced to screen readers. */
export function FlaskLoader({ label = "Loading", size = 56 }: { label?: string; size?: number }) {
  return (
    <div role="status" className="grid place-items-center gap-3 py-16 enter">
      <svg viewBox="0 0 64 80" width={size} height={size * 1.25} className="flask-loader" aria-hidden="true">
        <g className="liquid">
          <path d="M16 56 L26 38 h12 L48 56 Q50 66 40 66 H24 Q14 66 16 56Z" fill="var(--yellow)" />
        </g>
        <circle className="bubble" cx="28" cy="54" r="3" fill="#fff" stroke="var(--ink-900)" strokeWidth="1.5" />
        <circle className="bubble b2" cx="36" cy="58" r="2.2" fill="#fff" stroke="var(--ink-900)" strokeWidth="1.5" />
        <circle className="bubble b3" cx="32" cy="50" r="1.6" fill="#fff" stroke="var(--ink-900)" strokeWidth="1.5" />
        <path d="M26 6 h12 M28 6 v26 L10 62 Q6 74 22 74 H42 Q58 74 54 62 L36 32 V6" fill="none" stroke="var(--ink-900)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="hand !text-xl">{label}…</p>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <FlaskLoader label={label} />;
}

/** Inline spinner for buttons that are working. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <p role="alert" className="chip tone-red !whitespace-normal !py-2.5">
      <span className="dot" aria-hidden="true" />
      {msg}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-14 enter">
      <div className="relative mx-auto w-16 h-20 mb-4" aria-hidden="true">
        <TestTube className="bob !static w-8 mx-auto" fill="var(--yellow)" />
        <Spark className="twinkle w-4" style={{ right: 0, top: 0 }} />
      </div>
      <h2 className="!text-2xl">{title}</h2>
      {children && <div className="meta mt-2">{children}</div>}
    </div>
  );
}

/**
 * Page header with the playful layer: an optional hand-written note, a doodle cluster,
 * and (via <Squiggle>) one underlined word. Keep it to one loud thing per view.
 */
export function PageHeader({
  title,
  lead,
  action,
  note,
  doodles = "flask",
}: {
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  note?: string;
  doodles?: "flask" | "tube" | "beaker" | "atom" | "none";
}) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-4 mb-10 pt-2">
      {doodles !== "none" && <HeaderDoodles set={doodles} />}
      <div className="relative">
        {note && (
          <span className="hand block -rotate-3 mb-1 !text-lg" aria-hidden="true">
            {note}
          </span>
        )}
        <h1 className="!text-[clamp(2rem,4vw,3.25rem)]">{title}</h1>
        {lead && <p className="meta !text-base mt-3 max-w-xl">{lead}</p>}
      </div>
      {action && <div className="relative">{action}</div>}
    </header>
  );
}

/** Secondary content: a heading and a hairline separator instead of another card. */
export function Section({ title, children, aside, id }: { title: ReactNode; children: ReactNode; aside?: ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section className="section" aria-labelledby={id ?? hid}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 id={id ?? hid} className="!text-2xl">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------- Dialog -------------------------------- */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/20 transition-opacity duration-[var(--dur-base)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[var(--dur-fast)]" />
        <Dialog.Popup
          // Phones: a bottom sheet that slides up (thumb-reachable). Larger screens: a centred dialog.
          className={`fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] rounded-b-none pb-[max(24px,env(safe-area-inset-bottom))] data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100vw-32px)] sm:rounded-[var(--radius-lg)] sm:max-h-[90vh] sm:data-[starting-style]:translate-y-[-50%] sm:data-[starting-style]:scale-95 sm:data-[ending-style]:translate-y-[-50%] sm:data-[ending-style]:scale-95 ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} overflow-auto card !p-6 sm:!p-8 transition-all duration-[var(--dur-base)] ease-[var(--ease-enter)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[var(--dur-fast)] data-[ending-style]:ease-[var(--ease-exit)]`}
          style={{ boxShadow: "var(--shadow-float)" }}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <Dialog.Title render={<h2 className="!text-2xl" />}>{title}</Dialog.Title>
            <Dialog.Close className="btn btn-soft !p-0 !w-11 !h-11 !min-h-11 shrink-0" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          {description && <Dialog.Description className="meta mb-4">{description}</Dialog.Description>}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Staff actions need a 4-digit PIN (a staff ID card alone can't approve).
 * Wrong PINs shake the field; the server locks after 5 tries.
 */
export function PinDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: (pin: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const id = useId();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(pin);
      setPin("");
      onOpenChange(false);
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code.startsWith("pin")) setShakeKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={submit} className="grid gap-4">
        {children}
        <label className="label" htmlFor={id}>
          Your 4-digit staff PIN
          <input
            key={shakeKey}
            id={id}
            className={`input mono !text-2xl tracking-[0.5em] text-center ${shakeKey ? "shake" : ""}`}
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4}"
            maxLength={4}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            aria-describedby={`${id}-hint`}
          />
          <span id={`${id}-hint`} className="meta font-normal">
            Demo PINs are printed on the demo ID cards.
          </span>
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy || pin.length !== 4}>
          {busy ? "Checking…" : confirmLabel}
        </button>
      </form>
    </Modal>
  );
}

/* ------------------------------- Toasts -------------------------------- */

export function Toaster({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 grid gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className={`card !p-4 flex gap-3 items-start transition-all duration-[var(--dur-base)] ease-[var(--ease-enter)] data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2 data-[ending-style]:opacity-0 data-[ending-style]:duration-[var(--dur-fast)] ${t.type === "error" ? "tone-red" : t.type === "success" ? "tone-green" : ""}`}
      style={{ boxShadow: "var(--shadow-float)" }}
    >
      <div className="flex-1">
        <Toast.Title className="font-semibold" />
        <Toast.Description className="meta" />
      </div>
      <Toast.Close className="btn btn-soft !p-0 !w-9 !h-9 !min-h-9" aria-label="Dismiss">
        <X size={16} aria-hidden="true" />
      </Toast.Close>
    </Toast.Root>
  ));
}

export function useToast() {
  const m = Toast.useToastManager();
  return {
    success: (title: string, description?: string) => m.add({ title, description, type: "success" }),
    error: (e: unknown) => m.add({ title: e instanceof Error ? e.message : "Something went wrong.", type: "error", priority: "high" }),
    info: (title: string, description?: string) => m.add({ title, description }),
  };
}
