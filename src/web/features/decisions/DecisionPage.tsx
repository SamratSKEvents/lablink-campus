/** A stored decision record: appeal (students), what-if (faculty), override with reason (admin). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useParams } from "react-router-dom";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { Decision, Equipment } from "../../lib/types";
import { Chip, ErrorNote, Loading, PinDialog, useToast } from "../../components/ui";
import { DecisionCard } from "./DecisionCard";

interface Resp {
  decision: Decision;
  names: Record<string, string>;
  equipment?: Equipment;
}

export default function DecisionPage() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const q = useQuery({ queryKey: ["decision", id], queryFn: () => api<Resp>(`/decisions/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { decision, names, equipment } = q.data;
  return (
    <div className="grid gap-6 max-w-3xl">
      <DecisionCard decision={decision} names={names} equipmentName={equipment?.name} highlightUserId={user?.id} />
      {user?.role === "student" && decision.winnerUserId !== user.id && <Appeal id={id} />}
      {(user?.role === "faculty" || user?.role === "admin") && <WhatIf decision={decision} names={names} />}
      {user?.role === "admin" && <Override decision={decision} names={names} />}
    </div>
  );
}

function Appeal({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const fid = useId();
  const m = useMutation({ mutationFn: () => post(`/decisions/${id}/appeal`, { reason }) });
  return (
    <form className="card grid gap-3" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
      <h2 className="!text-xl">Think this is unfair?</h2>
      <label htmlFor={fid} className="label">
        Tell your faculty why (they'll see this record)
        <textarea id={fid} className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} required />
      </label>
      <ErrorNote error={m.error} />
      {m.isSuccess ? <Chip tone="green" className="justify-self-start">Appeal sent</Chip> : <button className="btn btn-soft justify-self-start" disabled={m.isPending || reason.trim().length < 10}>Send appeal</button>}
    </form>
  );
}

function WhatIf({ decision, names }: { decision: Decision; names: Record<string, string> }) {
  const others = decision.candidates.filter((c) => c.eligible && c.userId !== decision.winnerUserId);
  const [who, setWho] = useState(others[0]?.userId ?? "");
  const m = useMutation({ mutationFn: () => post<{ results: { owner?: string; slipMinutes: number; missesDeadline: boolean }[] }>(`/decisions/${decision.id}/what-if`, { userId: who }) });
  if (!others.length) return null;
  return (
    <section className="card grid gap-3">
      <h2 className="!text-xl">What if someone else got it?</h2>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="whatif">Give the slot to</label>
        <select id="whatif" className="input !w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
          {others.map((c) => <option key={c.userId} value={c.userId}>{names[c.userId]}</option>)}
        </select>
        <button className="btn btn-soft" onClick={() => m.mutate()} disabled={m.isPending}>Run what-if</button>
      </div>
      <ErrorNote error={m.error} />
      {m.data?.results.map((r) => (
        <p key={r.owner} className={`chip !whitespace-normal ${r.missesDeadline ? "tone-red" : "tone-yellow"}`} aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {r.owner}'s project would {r.missesDeadline ? "miss its deadline" : `finish ${Math.round(r.slipMinutes / 60)} h later, still on time`}.
        </p>
      ))}
    </section>
  );
}

function Override({ decision, names }: { decision: Decision; names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(decision.candidates.find((c) => c.eligible && c.userId !== decision.winnerUserId)?.userId ?? "");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <section className="card grid gap-3">
      <h2 className="!text-xl">Override</h2>
      <p className="meta">Overrides are logged with your reason and shown to everyone involved.</p>
      <button className="btn btn-soft justify-self-start" onClick={() => setOpen(true)}>Override this decision</button>
      <PinDialog
        open={open}
        onOpenChange={setOpen}
        title="Override decision"
        confirmLabel="Override"
        onConfirm={async (pin) => {
          await post(`/decisions/${decision.id}/override`, { winnerUserId: who, reason, pin });
          toast.success("Override recorded");
          void qc.invalidateQueries({ queryKey: ["decision", decision.id] });
        }}
      >
        <label className="label">
          New winner
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            {decision.candidates.filter((c) => c.eligible).map((c) => <option key={c.userId} value={c.userId}>{names[c.userId]}</option>)}
          </select>
        </label>
        <label className="label">
          Reason (at least 10 characters)
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
        </label>
      </PinDialog>
    </section>
  );
}
