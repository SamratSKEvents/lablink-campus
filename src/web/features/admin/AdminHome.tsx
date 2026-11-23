/**
 * Admin / HoD: utilisation (booked vs actual), Opportunity Radar, fairness, recent
 * decisions, and the Finals Week simulator, which runs the real engine on a staged rush.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, RotateCcw, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDay } from "@shared/time";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { Decision } from "../../lib/types";
import { AiNote, Chip, ErrorNote, Loading, PageHeader, useToast } from "../../components/ui";
import { DecisionCard } from "../decisions/DecisionCard";

interface Utilisation {
  totals: { booked: number; actual: number; available: number; utilisation: number; noShowHoursRecovered: number };
  units: { id: string; name: string; lab: string; bookedHours: number; actualHours: number; utilisation: number }[];
  radar: { idle: { name: string; lab: string; utilisation: number }[]; hot: { classLabel: string; demandHours: number; supplyHours: number }[]; actions: string[]; source: string };
  fairness: { gini: number; students: number };
  decisions: { id: string; createdAt: string; explanation: string }[];
}

interface FinalsWeek {
  decision: Decision;
  names: Record<string, string>;
  projects: Record<string, { title: string; emoji: string; deadline: string; verified: boolean; stage: string }>;
  equipment: { id: string; name: string };
  fairness: { giniBefore: number; giniLabLink: number; giniFcfs: number; fcfsWinner: string; labLinkWinner: string | null };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function AdminHome() {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const u = useQuery({ queryKey: ["utilisation"], queryFn: () => api<Utilisation>("/admin/utilisation") });
  const finals = useMutation({ mutationFn: () => post<FinalsWeek>("/admin/finals-week"), onSuccess: () => qc.invalidateQueries({ queryKey: ["utilisation"] }) });
  const reset = useMutation({ mutationFn: () => post("/admin/reset-demo"), onSuccess: () => (toast.success("Demo reset"), qc.invalidateQueries()) });

  return (
    <>
      <PageHeader
        title="Overview"
        lead="How lab time is used, where it's wasted, and whether it's shared fairly."
        action={
          <button className="btn btn-yellow" onClick={() => finals.mutate()} disabled={finals.isPending}>
            <Timer size={18} aria-hidden="true" /> {finals.isPending ? "Running the engine…" : "Run Finals Week"}
          </button>
        }
      />
      <ErrorNote error={u.error ?? finals.error ?? reset.error} />

      {finals.data && <FinalsWeekResult r={finals.data} />}

      {u.isLoading && <Loading />}
      {u.data && (
        <div className="grid gap-6 mt-8">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            <Stat label="Productive utilisation (7 days)" value={pct(u.data.totals.utilisation)} />
            <Stat label="Hours booked vs used" value={`${Math.round(u.data.totals.booked)} / ${Math.round(u.data.totals.actual)}`} />
            <Stat label="Hours lost to no-shows and early finishes" value={`${Math.round(u.data.totals.noShowHoursRecovered)} h`} />
            <Stat label="Fairness (Gini of lab hours, lower is fairer)" value={u.data.fairness.gini.toFixed(2)} />
          </dl>

          <section className="card grid gap-4" aria-labelledby="radar">
            <div className="flex items-center gap-3">
              <span className="appicon tone-blue" aria-hidden="true"><Radar size={22} /></span>
              <h2 id="radar" className="!text-2xl">Opportunity Radar</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="font-semibold mb-2">Sitting idle</p>
                <ul className="grid gap-2">
                  {u.data.radar.idle.map((i) => (
                    <li key={i.name} className="task-row"><Chip tone="neutral">{pct(i.utilisation)}</Chip><span className="text-sm">{i.name} · {i.lab}</span></li>
                  ))}
                  {u.data.radar.idle.length === 0 && <li className="meta">Nothing idle.</li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-2">Over-demand</p>
                <ul className="grid gap-2">
                  {u.data.radar.hot.map((h) => (
                    <li key={h.classLabel} className="task-row"><Chip tone="orange">{Math.round((h.demandHours / h.supplyHours) * 100)}%</Chip><span className="text-sm">{h.classLabel}: {h.demandHours} h booked of {h.supplyHours} h</span></li>
                  ))}
                  {u.data.radar.hot.length === 0 && <li className="meta">No class is over 50% booked this week.</li>}
                </ul>
              </div>
            </div>
            {u.data.radar.actions.length > 0 && (
              <AiNote source={u.data.radar.source}>
                <ul className="list-disc pl-5 mt-1 grid gap-1">{u.data.radar.actions.map((a) => <li key={a}>{a}</li>)}</ul>
              </AiNote>
            )}
          </section>

          <section className="card" aria-labelledby="units">
            <h2 id="units" className="!text-xl mb-3">Busiest units</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Hours booked and actually used per unit, last 7 days</caption>
                <thead>
                  <tr className="text-left text-ink-2"><th className="py-2 pr-4 font-semibold">Unit</th><th className="pr-4 font-semibold">Lab</th><th className="pr-4 font-semibold">Booked h</th><th className="pr-4 font-semibold">Used h</th><th className="font-semibold">Use</th></tr>
                </thead>
                <tbody>
                  {[...u.data.units].sort((a, b) => b.bookedHours - a.bookedHours).slice(0, 8).map((x) => (
                    <tr key={x.id} className="border-t border-line">
                      <td className="py-2 pr-4"><Link to={`/equipment/${x.id}`} className="hover:underline">{x.name}</Link></td>
                      <td className="pr-4">{x.lab}</td>
                      <td className="pr-4">{x.bookedHours}</td>
                      <td className="pr-4">{x.actualHours}</td>
                      <td>{pct(x.utilisation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {u.data.decisions.length > 0 && (
            <section className="card" aria-labelledby="decisions">
              <h2 id="decisions" className="!text-xl mb-3">Recent fairness decisions</h2>
              <ul className="grid gap-2">
                {u.data.decisions.map((d) => (
                  <li key={d.id}>
                    <Link to={`/decisions/${d.id}`} className="task-row hover:bg-subtle-hover">
                      <Chip tone="violet">{formatDay(d.createdAt)}</Chip>
                      <span className="text-sm">{d.explanation}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {user?.role === "admin" && (
            <button className="btn btn-soft justify-self-start" onClick={() => reset.mutate()} disabled={reset.isPending}>
              <RotateCcw size={16} aria-hidden="true" /> {reset.isPending ? "Resetting…" : "Reset demo data"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-5">
      <dt className="meta">{label}</dt>
      <dd className="font-display text-3xl mt-1">{value}</dd>
    </div>
  );
}

function FinalsWeekResult({ r }: { r: FinalsWeek }) {
  return (
    <section className="grid gap-4 enter" aria-labelledby="finals" aria-live="polite">
      <h2 id="finals">Finals Week: 5 students, 1 oscilloscope</h2>
      <ul className="flex flex-wrap gap-2" aria-label="Contenders">
        {Object.entries(r.projects).map(([uid, p]) => (
          <li key={uid}>
            <Chip tone={p.verified ? "violet" : "neutral"} dot={false}>
              {r.names[uid]}: {p.title}, due {formatDay(p.deadline)}{p.verified ? " ✓" : ""}
            </Chip>
          </li>
        ))}
      </ul>
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <DecisionCard decision={r.decision} names={r.names} equipmentName={r.equipment.name} />
        <div className="card grid gap-4 content-start">
          <h3>LabLink vs first-come-first-served</h3>
          <p><b>FCFS</b> gives it to {r.fairness.fcfsWinner}, who asked first.</p>
          <p><b>LabLink</b> gives it to {r.fairness.labLinkWinner}, based on verified deadline, stage, recent use, waiting time and fit.</p>
          <dl className="grid grid-cols-2 gap-3">
            <div className="task-row !block"><dt className="meta">Gini after FCFS</dt><dd className="font-display text-2xl">{r.fairness.giniFcfs.toFixed(3)}</dd></div>
            <div className="task-row !block !bg-green-tint"><dt className="meta">Gini after LabLink</dt><dd className="font-display text-2xl">{r.fairness.giniLabLink.toFixed(3)}</dd></div>
          </dl>
          <p className="meta">Lower Gini means lab hours are spread more evenly. Everyone who missed out was offered an alternative.</p>
          <Link to={`/decisions/${r.decision.id}`} className="btn btn-soft">Open the decision record</Link>
        </div>
      </div>
    </section>
  );
}
