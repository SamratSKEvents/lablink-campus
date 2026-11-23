/** One unit: live status, specs, upcoming schedule, verified equivalents, explainer, fault report. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EQUIPMENT_STATUSES } from "@shared/domain";
import { formatRange } from "@shared/time";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { Equipment, Lab, LiveStatus } from "../../lib/types";
import { AiNote, Chip, ErrorNote, Loading, LIVE_STATUS, Modal, PinDialog, useToast } from "../../components/ui";
import { ClassIcon } from "./ClassIcon";

interface Detail {
  equipment: Equipment & { classLabel: string; liveStatus: LiveStatus };
  lab?: Lab;
  equivalents: { id: string; name: string; model: string; data: { explanation: string }; source: string }[];
  schedule: { start: string; end: string; status: string; seat: number }[];
}

export const EXPLAINER_CLASSES = ["oscilloscope", "3d-printer"];

export default function EquipmentPage() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ["equipment-detail", id], queryFn: () => api<Detail>(`/equipment/${id}`) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;
  const { equipment: e, lab, equivalents, schedule } = data;
  const st = LIVE_STATUS[e.liveStatus]!;
  return (
    <article className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <ClassIcon classId={e.classId} />
        <div className="flex-1">
          <h1 className="!text-[clamp(1.75rem,3.5vw,2.5rem)]">{e.name}</h1>
          <p className="meta mt-1">
            {e.classLabel} · {e.model} · {lab?.name}, bench {e.bench}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Chip tone={st.tone}>{st.label}</Chip>
            {e.requiresCert && <Chip tone="violet" dot={false}>🎓 Certification required</Chip>}
            {e.requiresSupervision && <Chip tone="neutral" dot={false}>Technician on shift required</Chip>}
            {e.capacity > 1 && <Chip tone="neutral" dot={false}>Seats {e.capacity}</Chip>}
            {e.accessible && <Chip tone="neutral" dot={false}>♿ Accessible bench</Chip>}
          </div>
        </div>
        {EXPLAINER_CLASSES.includes(e.classId) && (
          <Link to={`/explainer/${e.id}`} className="btn btn-ai">
            ✦ How do I use it?
          </Link>
        )}
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="card" aria-labelledby="sched">
          <h2 id="sched" className="!text-xl mb-3">Coming up</h2>
          {schedule.length === 0 ? (
            <p className="meta">Nothing booked. It's all yours.</p>
          ) : (
            <ul className="grid gap-2">
              {schedule.map((s) => (
                <li key={`${s.start}-${s.seat}`} className="task-row">
                  <Chip tone={s.status === "held" ? "yellow" : "orange"}>{s.status === "held" ? "Held" : "Booked"}</Chip>
                  <span className="text-sm">{formatRange(s.start, s.end)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card grid gap-3 content-start" aria-labelledby="eqv">
          <h2 id="eqv" className="!text-xl">Can I use something else?</h2>
          {equivalents.length === 0 && <p className="meta">No verified equivalents yet.</p>}
          {equivalents.map((q) => (
            <div key={q.id} className="grid gap-2">
              <Link to={`/equipment/${q.id}`} className="font-semibold underline underline-offset-4">{q.name} · {q.model}</Link>
              <AiNote source={q.source}>{q.data.explanation}</AiNote>
            </div>
          ))}
          <p className="meta">Equivalence is decided by spec rules and technicians. AI only explains it.</p>
        </section>
      </div>

      {Object.keys(e.specs).length > 0 && (
        <section className="card" aria-labelledby="specs">
          <h2 id="specs" className="!text-xl mb-3">Specs</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(e.specs).map(([k, v]) => (
              <div key={k}>
                <dt className="meta">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                <dd className="font-display text-2xl">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <FaultReport equipmentId={e.id} name={e.name} />
        {(user?.role === "technician" || user?.role === "admin") && <StatusChange equipmentId={e.id} current={e.status} />}
      </div>
    </article>
  );
}

function FaultReport({ equipmentId, name }: { equipmentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const id = useId();
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post<{ rescueProposals: number }>("/faults", { equipmentId, note }),
    onSuccess: (r) => {
      setOpen(false);
      setNote("");
      toast.success("Fault reported. The unit is blocked.", `${r.rescueProposals} affected project(s) got a Rescue Mode plan.`);
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <button className="btn btn-soft" onClick={() => setOpen(true)}>Report a fault</button>
      <Modal open={open} onOpenChange={setOpen} title={`Report a fault: ${name}`} description="This blocks the unit, tells the technician, and re-plans affected projects.">
        <form className="grid gap-4" onSubmit={(ev) => (ev.preventDefault(), m.mutate())}>
          <label htmlFor={id} className="label">
            What's wrong?
            <textarea id={id} className="input min-h-24" value={note} onChange={(ev) => setNote(ev.target.value)} required maxLength={400} />
          </label>
          <ErrorNote error={m.error} />
          <button className="btn btn-primary" disabled={m.isPending || !note.trim()}>Report fault</button>
        </form>
      </Modal>
    </>
  );
}

function StatusChange({ equipmentId, current }: { equipmentId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(current === "available" ? "maintenance" : "available");
  const toast = useToast();
  const qc = useQueryClient();
  return (
    <>
      <button className="btn btn-soft" onClick={() => setOpen(true)}>Change status</button>
      <PinDialog
        open={open}
        onOpenChange={setOpen}
        title="Change equipment status"
        description="Taking a unit out of service starts Rescue Mode for every affected project."
        confirmLabel="Update status"
        onConfirm={async (pin) => {
          const r = await post<{ rescueProposals: unknown[] }>(`/equipment/${equipmentId}/status`, { status, pin });
          toast.success("Status updated", r.rescueProposals.length ? `Rescue Mode re-planned ${r.rescueProposals.length} project(s).` : undefined);
          void qc.invalidateQueries();
        }}
      >
        <label className="label">
          New status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
      </PinDialog>
    </>
  );
}
