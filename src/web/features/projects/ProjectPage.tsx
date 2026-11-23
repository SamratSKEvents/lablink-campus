/**
 * Feasibility Passport: every step, what's booked or held, what's blocking it, approvals,
 * prerequisites and safety, plus one clear next action. Rescue Mode appears here when a
 * unit this project depends on breaks.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Check, LifeBuoy } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatDay, formatRange, minutesBetween } from "@shared/time";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { Booking, Passport, Placement, Project } from "../../lib/types";
import { Chip, ErrorNote, Loading, RISK, Segments, Skeleton, Spinner, TASK_STATE, useToast } from "../../components/ui";
import { PartsList } from "./NewProject";
import { SafetyCard } from "./SafetyCard";

const Xray = lazy(() => import("../../three/Xray"));

interface ProjectResponse {
  project: Project & { owner: string };
  passport: Passport;
  request: { id: string; status: string } | null;
  xray: { supported: boolean };
}

export default function ProjectPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const rescueEq = params.get("rescue");
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectResponse>(`/projects/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["project", id] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const [celebrate, setCelebrate] = useState(false);

  const ack = useMutation({ mutationFn: () => post(`/projects/${id}/acknowledge-safety`), onSuccess: refresh });
  const request = useMutation({ mutationFn: () => post(`/projects/${id}/request`), onSuccess: () => (toast.success("Request sent to your faculty"), refresh()) });
  const hold = useMutation({ mutationFn: () => post<{ bookings: Booking[]; status: string }>(`/projects/${id}/hold`, { idempotencyKey: crypto.randomUUID() }), onSuccess: refresh });
  const confirm = useMutation({ mutationFn: () => post(`/projects/${id}/confirm`), onSuccess: () => (setCelebrate(true), refresh()) });

  if (q.isLoading) return <Loading label="Opening the passport" />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const { project: p, passport: pp, xray } = q.data;
  const risk = RISK[pp.risk]!;
  const owner = user?.id === p.ownerId;
  const unbooked = pp.tasks.filter((t) => t.state === "planned" || t.state === "unresolved");
  const held = pp.tasks.filter((t) => t.state === "held");
  const booked = pp.tasks.filter((t) => t.state === "booked" || t.state === "done").length;
  const needsAck = pp.safety.level === "high" && !pp.safety.acknowledged;
  const err = ack.error ?? request.error ?? hold.error ?? confirm.error;

  // The one loud action for this state (DESIGN.md: one primary per view).
  let primary: React.ReactNode = null;
  if (owner) {
    if (pp.approval.status === "not_requested" || pp.approval.status === "rejected") {
      primary = needsAck ? (
        <button className="btn btn-primary" onClick={() => ack.mutate()} disabled={ack.isPending}>I've read the safety precautions</button>
      ) : (
        <button className="btn btn-primary" onClick={() => request.mutate()} disabled={request.isPending}>Request lab access</button>
      );
    } else if (pp.approval.status === "approved" && held.length) {
      primary = <button className="btn btn-primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>{confirm.isPending ? <><Spinner /> Confirming…</> : `Confirm ${held.length} booking${held.length > 1 ? "s" : ""}`}</button>;
    } else if (pp.approval.status === "approved" && unbooked.some((t) => t.state === "planned")) {
      primary = <button className="btn btn-primary" onClick={() => hold.mutate()} disabled={hold.isPending}>{hold.isPending ? <><Spinner /> Holding slots…</> : "Book my plan"}</button>;
    } else if (booked === pp.tasks.length) {
      primary = <Link className="btn btn-primary" to="/session">Open lab session</Link>;
    }
  }

  return (
    <article className="grid gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="!text-[clamp(1.75rem,3.5vw,2.75rem)]">
            {p.title} <span aria-hidden="true">{p.emoji}</span>
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
            <Chip tone={risk.tone}>{risk.label}</Chip>
            <Chip tone="neutral" dot={false}>Due {formatDay(p.deadline)}</Chip>
            <Chip tone="neutral" dot={false}>{p.stage}</Chip>
            {p.verifiedBy ? <Chip tone="violet">Deadline and stage verified</Chip> : <Chip tone="neutral">Not yet verified by faculty</Chip>}
            {!owner && <Chip tone="neutral" dot={false}>{p.owner}</Chip>}
          </div>
        </div>
        {primary}
      </header>

      {rescueEq && owner && <RescuePanel projectId={p.id} equipmentId={rescueEq} onDone={refresh} />}
      <ErrorNote error={err} />
      {celebrate && (
        <div className="card flex items-center gap-4 tone-green enter" role="status">
          <span className="appicon bg-green text-ink pop" aria-hidden="true"><Check size={24} /></span>
          <div>
            <p className="font-display text-2xl">You're booked.</p>
            <p>Every step of {p.title} fits before your deadline. Tap your ID at the bench to start.</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <section className="card" aria-labelledby="steps-title">
          <h2 id="steps-title" className="!text-2xl">Feasibility Passport</h2>
          <Segments colors={pp.tasks.map((t) => TASK_STATE[t.state]!.bar)} label={`${booked} of ${pp.tasks.length} steps booked`} />
          <p className="meta mb-4">{pp.riskReason}</p>
          <ol className="grid gap-1.5">
            {pp.tasks.map((t, i) => {
              const st = TASK_STATE[t.state]!;
              const when = t.booking ?? t.proposal;
              return (
                <li key={t.id}>
                  {i > 0 && <ArrowDown size={16} className="mx-auto text-ink-3 my-0.5" aria-hidden="true" />}
                  <div className="task-row">
                    <Chip tone={st.tone}>{st.label}</Chip>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{t.name}</p>
                      <p className="meta">
                        {t.classLabel} · {t.durationMin} min
                        {when && <> · {formatRange(when.start, when.end)}</>}
                      </p>
                      {t.blocker && <p className="text-sm text-red-ink mt-1">{t.blocker}</p>}
                      {t.state === "held" && t.booking && <HoldTimer booking={t.booking} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {pp.preview.status === "partial" && <p className="meta mt-4">Some steps can't be placed yet. You can still book the rest now, and LabLink keeps the others on its radar.</p>}
        </section>

        <div className="grid gap-6 content-start lg:pl-2">
          <section className="grid gap-3" aria-labelledby="checks-title">
            <h2 id="checks-title" className="!text-xl">Checklist</h2>
            <CheckRow ok={pp.approval.status === "approved"} label={{ approved: "Faculty approved", pending: "Waiting for faculty approval", rejected: "Request needs changes", not_requested: "Not requested yet" }[pp.approval.status]} />
            {pp.prerequisites.map((pr) => (
              <CheckRow key={pr.classId} ok={pr.met} label={`${pr.met ? "Certified" : "Needs certification"}: ${pr.classLabel}${pr.level === "supervised" ? " (supervised)" : ""}`} />
            ))}
            {pp.prerequisites.length === 0 && <CheckRow ok label="No certifications needed" />}
            <CheckRow ok={!needsAck} label={needsAck ? "Read the safety precautions" : "Safety precautions acknowledged"} />
          </section>
          <section className="grid gap-3 pt-6 border-t border-line" aria-labelledby="xray-title">
            <h2 id="xray-title" className="!text-xl">Project X-Ray</h2>
            {xray.supported && p.parts.length ? (
              <Suspense fallback={<Skeleton className="h-64" />}>
                <Xray parts={p.parts} tasks={pp.tasks.map((t) => ({ id: t.id, name: t.name, equipment: t.classLabel }))} />
              </Suspense>
            ) : (
              <PartsList parts={p.parts} note={p.parts.length ? "3D preview isn't available for this project type." : "No parts listed."} />
            )}
          </section>
        </div>
      </div>
      <SafetyCard safety={pp.safety} />
    </article>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2">
      <Chip tone={ok ? "green" : "orange"} className="!px-2">
        <span className="sr-only">{ok ? "Done" : "To do"}</span>
      </Chip>
      {label}
    </p>
  );
}

function HoldTimer({ booking }: { booking: Pick<Booking, "start"> & { expiresAt?: string } }) {
  const left = booking.expiresAt ? Math.max(0, minutesBetween(new Date(), booking.expiresAt)) : 30;
  return <p className="text-sm text-yellow-ink mt-1">Held for you · {left} min left to confirm</p>;
}

interface RescueResponse {
  proposal: { affectedBookingIds: string[]; moves: { taskId: string; fromEquipmentId: string | null; to: Placement }[]; needsApproval: boolean; result: { status: string } } | null;
  equipment: Record<string, { name: string; classLabel: string }>;
}

function RescuePanel({ projectId, equipmentId, onDone }: { projectId: string; equipmentId: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ["rescue", equipmentId, projectId], queryFn: () => api<RescueResponse>(`/rescue/${equipmentId}/${projectId}`) });
  const accept = useMutation({ mutationFn: () => post(`/rescue/${equipmentId}/${projectId}/accept`, { idempotencyKey: crypto.randomUUID() }), onSuccess: onDone });
  const eq = q.data?.equipment ?? {};
  return (
    <section className="card tone-orange grid gap-3" aria-labelledby="rescue-title" role="region">
      <div className="flex items-center gap-3">
        <span className="appicon bg-white text-orange-ink" aria-hidden="true"><LifeBuoy size={22} /></span>
        <h2 id="rescue-title" className="!text-2xl !text-ink">Rescue Mode</h2>
      </div>
      <p className="text-ink">{eq[equipmentId]?.name ?? "A unit"} you booked is out of service. Here's a recovery plan that still keeps your deadline.</p>
      {q.isLoading && <p className="meta">Working out a recovery plan…</p>}
      {q.data?.proposal === null && <p className="text-ink">Nothing in this project is affected any more.</p>}
      {q.data?.proposal && (
        <>
          <ul className="grid gap-2">
            {q.data.proposal.moves.map((m) => (
              <li key={m.taskId} className="task-row !bg-white text-ink">
                <span className="flex-1">
                  <b>{eq[m.to.equipmentId]?.name}</b> · {formatRange(m.to.start, m.to.end)}
                  {m.fromEquipmentId && <span className="meta"> (was {eq[m.fromEquipmentId]?.name})</span>}
                </span>
                {m.to.fit !== "exact" && <Chip tone="violet">Equivalent</Chip>}
              </li>
            ))}
          </ul>
          {q.data.proposal.needsApproval && <p className="text-ink text-sm">This uses equivalent equipment, so your faculty will confirm it.</p>}
          <ErrorNote error={accept.error} />
          {accept.isSuccess ? (
            <p className="chip tone-green"><span className="dot" aria-hidden="true" />Recovered. Your new slots are held. Confirm them above.</p>
          ) : (
            <button className="btn btn-primary justify-self-start" onClick={() => accept.mutate()} disabled={accept.isPending || !q.data.proposal.moves.length}>
              Accept recovery plan
            </button>
          )}
        </>
      )}
    </section>
  );
}
