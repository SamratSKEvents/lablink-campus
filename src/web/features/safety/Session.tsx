/**
 * Use: tap in at the bench, confirm PPE, work safely. SOS is always on screen.
 * Solo sessions on high-hazard equipment get "Are you OK?" check-ins every 20 minutes;
 * a missed check-in asks the technician for a welfare check (never an automatic SOS).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { classById } from "@shared/catalogue";
import { formatRange } from "@shared/time";
import { api, post } from "../../lib/api";
import type { Booking } from "../../lib/types";
import { Chip, Empty, ErrorNote, Loading, Modal, PageHeader } from "../../components/ui";
import { SosSheet } from "../../components/Sos";

interface MyBooking extends Booking {
  live: boolean;
  equipment?: { id: string; name: string; labId: string; bench: string; classId?: string };
}

const PPE = ["Closed shoes and tied-back hair", "Safety glasses on", "I know where the exit, extinguisher and eyewash are"];

export default function Session() {
  const { data, isLoading, error } = useQuery({ queryKey: ["my-bookings"], queryFn: () => api<{ items: MyBooking[] }>("/bookings/mine"), refetchInterval: 30_000 });
  const [sosOpen, setSosOpen] = useState(false);
  if (isLoading) return <Loading />;
  const items = (data?.items ?? []).filter((b) => b.live || b.status === "checked_in");
  const active = items.find((b) => b.status === "checked_in");
  const next = items.find((b) => b.status === "confirmed");
  const focus = active ?? next;
  const ctx = { labId: focus?.equipment?.labId ?? "lab-ece-1", ...(focus?.equipment ? { bench: focus.equipment.bench, equipmentId: focus.equipment.id } : {}) };

  return (
    <>
      <PageHeader title={active ? `In session: ${active.equipment?.name}` : "Lab session"} lead="Tap your ID at the bench kiosk, confirm your PPE, and you're in." />
      <ErrorNote error={error} />
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="grid gap-6 content-start">
          {!focus && (
            <Empty title="No session right now">
              Book a project first. <Link to="/projects" className="underline">Go to my projects</Link>
            </Empty>
          )}
          {active && <ActiveSession booking={active} />}
          {!active && next && <CheckIn booking={next} />}
          {items.filter((b) => b !== focus).length > 0 && (
            <section className="card">
              <h2 className="!text-xl mb-3">Later</h2>
              <ul className="grid gap-2">
                {items.filter((b) => b !== focus).map((b) => (
                  <li key={b.id} className="task-row">
                    <Chip tone="orange">Booked</Chip>
                    <span className="text-sm">{b.equipment?.name} · {formatRange(b.start, b.end)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="card grid gap-5 place-items-center text-center content-start" aria-label="Emergency">
          <h2 className="!text-xl">Hold for help</h2>
          <button type="button" className="sos" onClick={() => setSosOpen(true)} aria-label="Open SOS (Alt+S)" aria-keyshortcuts="Alt+S">
            SOS<small>press, then hold</small>
          </button>
          <a className="btn btn-primary w-full !text-lg" href="tel:112"><Phone size={20} aria-hidden="true" /> Call 112</a>
          <p className="meta">In-app alerts are supplementary. Always call 112 in an emergency.</p>
        </aside>
      </div>
      <SosSheet open={sosOpen} onOpenChange={setSosOpen} context={ctx} />
    </>
  );
}

function CheckIn({ booking }: { booking: MyBooking }) {
  const [ticked, setTicked] = useState<boolean[]>(PPE.map(() => false));
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: () => post(`/bookings/${booking.id}/check-in`, { ppeConfirmed: true }), onSuccess: () => qc.invalidateQueries({ queryKey: ["my-bookings"] }) });
  const opens = new Date(new Date(booking.start).getTime() - 10 * 60_000);
  return (
    <section className="card grid gap-4" aria-labelledby="checkin">
      <h2 id="checkin" className="!text-2xl">Next: {booking.equipment?.name}</h2>
      <p className="meta">{formatRange(booking.start, booking.end)} · bench {booking.equipment?.bench}</p>
      <fieldset className="grid gap-2">
        <legend className="font-semibold mb-1">Before you start</legend>
        {PPE.map((p, i) => (
          <label key={p} className="task-row cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-[var(--ink-900)]" checked={ticked[i]} onChange={(e) => setTicked((t) => t.map((x, j) => (j === i ? e.target.checked : x)))} />
            {p}
          </label>
        ))}
      </fieldset>
      <ErrorNote error={m.error} />
      <button className="btn btn-primary justify-self-start" onClick={() => m.mutate()} disabled={!ticked.every(Boolean) || m.isPending}>
        {new Date() < opens ? `Check-in opens at ${opens.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : "Check in"}
      </button>
    </section>
  );
}

function ActiveSession({ booking }: { booking: MyBooking }) {
  const qc = useQueryClient();
  const hazard = classById(booking.equipment?.classId ?? "")?.hazard ?? "low";
  const solo = !booking.buddyId;
  const monitored = hazard === "high" && solo;
  const complete = useMutation({ mutationFn: () => post(`/bookings/${booking.id}/complete`), onSuccess: () => qc.invalidateQueries({ queryKey: ["my-bookings"] }) });
  return (
    <section className="card grid gap-4" aria-labelledby="active">
      <div className="flex flex-wrap gap-2 items-center">
        <h2 id="active" className="!text-2xl flex-1">You're checked in</h2>
        <Chip tone="green">Session live</Chip>
        {monitored && <Chip tone="violet">Lone-worker check-ins on</Chip>}
      </div>
      <p className="meta">{booking.equipment?.name} · bench {booking.equipment?.bench} · until {formatRange(booking.start, booking.end).split("–")[1]}</p>
      {monitored && <WellnessMonitor bookingId={booking.id} />}
      <div className="flex flex-wrap gap-3">
        <Link to={`/equipment/${booking.equipmentId}`} className="btn btn-soft">Equipment help and fault report</Link>
        <button className="btn btn-primary" onClick={() => complete.mutate()} disabled={complete.isPending}>Finish session</button>
      </div>
      <ErrorNote error={complete.error} />
    </section>
  );
}

/** Polls the server-owned wellness state. Responding needs one tap, key press, or ID tap. */
function WellnessMonitor({ bookingId }: { bookingId: string }) {
  const [step, setStep] = useState<"none" | "prompt" | "reprompt" | "welfare_check">("none");
  const busy = useRef(false);
  const tick = async (responded = false) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await post<{ step: typeof step }>(`/wellness/${bookingId}/tick`, { responded });
      setStep(responded ? "none" : r.step);
      if (!responded && (r.step === "prompt" || r.step === "reprompt")) navigator.vibrate?.([300, 150, 300]);
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    const t = window.setInterval(() => void tick(), 30_000);
    void tick();
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  return (
    <>
      <p className="meta">You're working alone on high-hazard equipment, so LabLink checks in every 20 minutes.</p>
      {step === "welfare_check" && (
        <p className="chip tone-orange !whitespace-normal" role="alert">
          <span className="dot" aria-hidden="true" />A technician has been asked to check on you. Tap “I'm OK” if you're fine.
        </p>
      )}
      <Modal open={step === "prompt" || step === "reprompt" || step === "welfare_check"} onOpenChange={(o) => !o && void tick(true)} title="Are you OK?" description={step === "reprompt" ? "We didn't hear back. Please confirm you're OK." : "Quick check-in for solo high-hazard work."}>
        <div className="grid gap-3">
          <button className="btn btn-primary !text-lg" onClick={() => void tick(true)} autoFocus>I'm OK</button>
          <p className="meta">Need help? Use SOS or call 112.</p>
        </div>
      </Modal>
    </>
  );
}
