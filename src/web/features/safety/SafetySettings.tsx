/**
 * Student safety: opt-in evacuation plan (minimum data, visible to responders only during
 * an active incident, deletable any time), anonymous near-miss reports, certifications.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { classLabel } from "@shared/catalogue";
import { formatDay } from "@shared/time";
import { api } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { Chip, ErrorNote, PageHeader, useToast } from "../../components/ui";

const NEEDS = [
  { id: "wheelchair", label: "I use a wheelchair or mobility aid" },
  { id: "deaf_hoh", label: "I'm deaf or hard of hearing (visual and vibration alerts)" },
  { id: "blind_low_vision", label: "I'm blind or have low vision" },
  { id: "other", label: "Something else" },
] as const;

const LABS = [
  ["lab-ece-1", "ECE Lab 1"],
  ["lab-ece-2", "ECE Lab 2"],
  ["lab-mech-1", "Fabrication Lab"],
  ["lab-mech-2", "Machine Shop"],
  ["lab-cse-1", "Embedded Systems Lab"],
  ["lab-cse-2", "FPGA Lab"],
  ["lab-chem-1", "Analytical Chemistry Lab"],
  ["lab-phys-2", "Electronics Teaching Lab"],
] as const;

export default function SafetySettings() {
  const { user } = useSession();
  return (
    <>
      <PageHeader title="Safety" lead="Your safety settings, private by default." />
      <div className="grid lg:grid-cols-2 gap-6">
        <EvacuationPlan />
        <NearMiss />
        <section className="card grid gap-3 content-start" aria-labelledby="certs">
          <h2 id="certs" className="!text-xl">Certifications</h2>
          {user?.certifications.length ? (
            <ul className="grid gap-2">
              {user.certifications.map((c) => (
                <li key={c.classId} className="task-row">
                  <Chip tone="violet">{c.level === "supervised" ? "Supervised" : "Certified"}</Chip>
                  <span className="flex-1">{classLabel(c.classId)}</span>
                  <span className="meta">until {formatDay(c.expiresAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">None yet. A technician certifies you after hands-on training.</p>
          )}
          {user?.tutorials.length ? <p className="meta">Tutorials completed: {user.tutorials.map(classLabel).join(", ")}. Tutorials don't certify you.</p> : null}
        </section>
      </div>
    </>
  );
}

function EvacuationPlan() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["evac"], queryFn: () => api<{ plan: { needs: string[]; instructions: string } | null }>("/evacuation") });
  const [needs, setNeeds] = useState<string[] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const curNeeds = needs ?? q.data?.plan?.needs ?? [];
  const curText = instructions ?? q.data?.plan?.instructions ?? "";
  const tid = useId();
  const save = useMutation({ mutationFn: () => api("/evacuation", { method: "PUT", body: { needs: curNeeds, instructions: curText } }), onSuccess: () => (toast.success("Evacuation plan saved"), qc.invalidateQueries({ queryKey: ["evac"] })) });
  const remove = useMutation({ mutationFn: () => api("/evacuation", { method: "DELETE" }), onSuccess: () => (setNeeds([]), setInstructions(""), toast.success("Deleted"), qc.invalidateQueries({ queryKey: ["evac"] })) });
  return (
    <section className="card grid gap-4" aria-labelledby="evac">
      <h2 id="evac" className="!text-xl">Personal evacuation plan (optional)</h2>
      <p className="meta">If an SOS fires while you're checked in, responders see what help you need. Only during an active incident. You can delete it any time.</p>
      <fieldset className="grid gap-2">
        <legend className="sr-only">I may need help because</legend>
        {NEEDS.map((n) => (
          <label key={n.id} className="task-row cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-[var(--ink-900)]" checked={curNeeds.includes(n.id)} onChange={(e) => setNeeds(e.target.checked ? [...curNeeds, n.id] : curNeeds.filter((x) => x !== n.id))} />
            {n.label}
          </label>
        ))}
      </fieldset>
      <label htmlFor={tid} className="label">
        What should responders know? (short)
        <input id={tid} className="input" value={curText} maxLength={300} onChange={(e) => setInstructions(e.target.value)} placeholder="Use the east ramp; I need someone to guide me" />
      </label>
      <ErrorNote error={save.error ?? remove.error} />
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!curNeeds.length || save.isPending}>Save plan</button>
        {q.data?.plan && <button className="btn btn-soft" onClick={() => remove.mutate()}>Delete my plan</button>}
      </div>
    </section>
  );
}

function NearMiss() {
  const [labId, setLabId] = useState<string>(LABS[0][0]);
  const [description, setDescription] = useState("");
  const toast = useToast();
  const lid = useId();
  const did = useId();
  const m = useMutation({ mutationFn: () => api("/near-misses", { body: { labId, description } }), onSuccess: () => (setDescription(""), toast.success("Thanks. Reported anonymously.")) });
  return (
    <form className="card grid gap-4 content-start" aria-labelledby="nm" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
      <h2 id="nm" className="!text-xl">Report a near-miss, anonymously</h2>
      <p className="meta">Frayed cable, weak extractor, a spill nobody cleaned? Near-misses come before accidents. We don't store who reported it.</p>
      <label htmlFor={lid} className="label">
        Where
        <select id={lid} className="input" value={labId} onChange={(e) => setLabId(e.target.value)}>
          {LABS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label htmlFor={did} className="label">
        What happened
        <textarea id={did} className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} minLength={5} maxLength={500} required />
      </label>
      <ErrorNote error={m.error} />
      <button className="btn btn-primary justify-self-start" disabled={m.isPending || description.trim().length < 5}>Report anonymously</button>
    </form>
  );
}
