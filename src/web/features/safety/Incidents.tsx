/**
 * Live incidents for responders: SOS, faults and welfare checks, with evacuation needs
 * (only while active), an AI-drafted report that staff edit, and PIN-confirmed resolve.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SOS_LABELS } from "@shared/sos";
import type { SosType } from "@shared/domain";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { AiNote, Chip, Empty, ErrorNote, Loading, PageHeader, PinDialog, useToast } from "../../components/ui";

interface IncidentRow {
  id: string;
  type: string;
  status: "active" | "resolved";
  at: string;
  userName: string;
  labName: string;
  bench?: string;
  equipmentName?: string;
  demo: boolean;
  log: { at: string; text: string }[];
  reportDraft?: string;
  evacuation?: { needs: string[]; instructions: string };
}

const TYPE_LABEL = (t: string) => (t === "fault" ? "Fault" : t === "welfare_check" ? "Welfare check" : SOS_LABELS[t as SosType] ?? t);

export default function Incidents() {
  const { data, isLoading, error } = useQuery({ queryKey: ["incidents"], queryFn: () => api<{ items: IncidentRow[] }>("/incidents"), refetchInterval: 5_000 });
  const active = data?.items.filter((i) => i.status === "active") ?? [];
  const resolved = data?.items.filter((i) => i.status === "resolved") ?? [];
  return (
    <>
      <PageHeader title="Incidents" lead="Live alerts from every lab you're responsible for. Updates every few seconds." />
      <ErrorNote error={error} />
      {isLoading && <Loading />}
      {data && active.length === 0 && <Empty title="No active incidents">Everyone's safe right now.</Empty>}
      <ul className="grid gap-4 mb-10" aria-live="polite">
        {active.map((i) => <IncidentCard key={i.id} incident={i} />)}
      </ul>
      {resolved.length > 0 && (
        <>
          <h2 className="!text-xl mb-3">Resolved</h2>
          <ul className="grid gap-2">
            {resolved.map((i) => (
              <li key={i.id} className="task-row">
                <Chip tone="neutral">{TYPE_LABEL(i.type)}</Chip>
                <span className="text-sm flex-1">{i.labName} · {i.userName}</span>
                <span className="meta">{new Date(i.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function IncidentCard({ incident: i }: { incident: IncidentRow }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState(i.reportDraft ?? "");
  const gen = useMutation({ mutationFn: () => post<{ draft: string; source: string }>(`/incidents/${i.id}/draft`), onSuccess: (r) => setDraft(r.draft) });
  const sos = i.type !== "fault" && i.type !== "welfare_check";
  return (
    <li className={`card grid gap-3 ${sos ? "ring-2 ring-red" : ""}`} role={sos ? "alert" : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={sos ? "red" : i.type === "welfare_check" ? "orange" : "yellow"}>{TYPE_LABEL(i.type)}</Chip>
        {i.demo && <Chip tone="neutral" dot={false}>Demo</Chip>}
        <h2 className="!text-xl flex-1">
          {i.labName}
          {i.bench ? `, bench ${i.bench}` : ""}
        </h2>
        <span className="meta">{new Date(i.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <p>{i.userName}{i.equipmentName ? ` · ${i.equipmentName}` : ""}</p>
      {i.evacuation && (
        <p className="chip tone-violet !whitespace-normal">
          <span className="dot" aria-hidden="true" />
          Needs evacuation assistance ({i.evacuation.needs.join(", ").replace(/_/g, " ")}): {i.evacuation.instructions}
        </p>
      )}
      <ol className="meta grid gap-0.5">
        {i.log.map((l) => <li key={l.at + l.text}>{new Date(l.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}: {l.text}</li>)}
      </ol>
      {user?.role !== "security" && (
        <div className="grid gap-2">
          {draft ? (
            <>
              <AiNote source={gen.data?.source ?? "gemini"}>Draft report. Please edit before filing.</AiNote>
              <label className="sr-only" htmlFor={`draft-${i.id}`}>Incident report draft</label>
              <textarea id={`draft-${i.id}`} className="input min-h-32 mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
            </>
          ) : (
            <button className="btn btn-ai btn-sm justify-self-start" onClick={() => gen.mutate()} disabled={gen.isPending}>✦ Draft incident report</button>
          )}
          <ErrorNote error={gen.error} />
        </div>
      )}
      <button className="btn btn-primary justify-self-start" onClick={() => setResolveOpen(true)}>Mark resolved</button>
      <PinDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title="Resolve incident"
        confirmLabel="Resolve"
        onConfirm={async (pin) => {
          await post(`/incidents/${i.id}/resolve`, { note, pin });
          toast.success("Incident resolved");
          void qc.invalidateQueries({ queryKey: ["incidents"] });
        }}
      >
        <label className="label">
          What happened (for the log)
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} minLength={3} required />
        </label>
      </PinDialog>
    </li>
  );
}
