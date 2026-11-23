/**
 * Admin / HoD overview: how lab time is used (ring, trend, heatmap, booked-vs-used),
 * whether it's shared fairly (Lorenz curve), Opportunity Radar, recent decisions, and
 * the Finals Week simulator, which runs the real engine on a staged rush.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, RotateCcw, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDay } from "@shared/time";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { Decision } from "../../lib/types";
import { AiNote, Chip, ErrorNote, FlaskLoader, Loading, PageHeader, Spinner, useToast } from "../../components/ui";
import { Squiggle } from "../../components/Doodles";
import { DecisionCard } from "../decisions/DecisionCard";
import { Dumbbell, Heatmap, Legend, Lorenz, SERIES, TableView, Trend, UtilRing } from "./charts";

interface Utilisation {
  totals: { booked: number; actual: number; available: number; utilisation: number; noShowHoursRecovered: number };
  units: { id: string; name: string; lab: string; bookedHours: number; actualHours: number; utilisation: number }[];
  radar: { idle: { name: string; lab: string; utilisation: number }[]; hot: { classLabel: string; demandHours: number; supplyHours: number }[]; actions: string[]; source: string };
  fairness: { gini: number; students: number; studentHours: number[] };
  heatmap: number[][];
  daily: { day: string; booked: number; used: number }[];
  decisions: { id: string; createdAt: string; explanation: string }[];
}

interface FinalsWeek {
  decision: Decision;
  names: Record<string, string>;
  projects: Record<string, { title: string; emoji: string; deadline: string; verified: boolean; stage: string }>;
  equipment: { id: string; name: string };
  fairness: { giniBefore: number; giniLabLink: number; giniFcfs: number; fcfsWinner: string; labLinkWinner: string | null; hoursLabLink: number[]; hoursFcfs: number[] };
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
        title={<>Lab <Squiggle color="var(--green)">overview</Squiggle></>}
        note="↘ last 7 days, every department"
        doodles="atom"
        lead="How lab time is used, where it's wasted, and whether it's shared fairly."
        action={
          <button className="btn btn-yellow" onClick={() => finals.mutate()} disabled={finals.isPending}>
            {finals.isPending ? <Spinner /> : <Timer size={18} aria-hidden="true" />} {finals.isPending ? "Running the engine…" : "Run Finals Week"}
          </button>
        }
      />
      <ErrorNote error={u.error ?? finals.error ?? reset.error} />

      {finals.isPending && <FlaskLoader label="Scoring five students fairly" />}
      {finals.data && <FinalsWeekResult r={finals.data} />}

      {u.isLoading && <Loading label="Crunching a week of lab time" />}
      {u.data && (
        <div className="mt-2">
          <section className="section grid gap-8 lg:grid-cols-[auto_1fr] items-center" aria-labelledby="usage">
            <div className="grid gap-6">
              <h2 id="usage" className="!text-2xl">Usage</h2>
              <UtilRing value={u.data.totals.utilisation} label="of available bench time was actually used" />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div><dt className="meta">Booked</dt><dd className="font-display text-2xl">{Math.round(u.data.totals.booked)} h</dd></div>
                <div><dt className="meta">Used</dt><dd className="font-display text-2xl">{Math.round(u.data.totals.actual)} h</dd></div>
                <div className="col-span-2"><dt className="meta">Lost to no-shows and early finishes</dt><dd className="font-display text-2xl text-orange-ink">{Math.round(u.data.totals.noShowHoursRecovered)} h</dd></div>
              </dl>
            </div>
            <div>
              <div className="flex flex-wrap justify-between gap-3 mb-2">
                <p className="font-semibold">Booked vs used, per day</p>
                <Legend items={[{ label: "Booked", color: SERIES.booked }, { label: "Used", color: SERIES.used }]} />
              </div>
              <Trend daily={u.data.daily} />
              <TableView caption="Hours booked and used per day" head={["Day", "Booked (h)", "Used (h)"]} rows={u.data.daily.map((d) => [d.day, d.booked, d.used])} />
            </div>
          </section>

          <section className="section grid gap-10 lg:grid-cols-2" aria-label="Demand and fairness">
            <div>
              <h2 className="!text-2xl mb-1">When labs are busy</h2>
              <p className="meta mb-4">Booked hours by weekday and hour.</p>
              <Heatmap grid={u.data.heatmap} />
              <TableView caption="Booked hours by weekday and hour" head={["Day", ...Array.from({ length: 14 }, (_, h) => `${h + 8}:00`)]} rows={u.data.heatmap.map((r, d) => [["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]!, ...r])} />
            </div>
            <div>
              <h2 className="!text-2xl mb-1">Is lab time shared fairly?</h2>
              <p className="meta mb-4">
                Gini {u.data.fairness.gini.toFixed(2)} across {u.data.fairness.students} students. The nearer the curve hugs the diagonal, the fairer.
              </p>
              <Lorenz series={[{ label: "This week", color: SERIES.lablink, values: u.data.fairness.studentHours }]} />
              <TableView caption="Lab hours per student, lowest first" head={["Student (anonymous)", "Hours"]} rows={u.data.fairness.studentHours.map((h, i) => [`#${i + 1}`, h])} />
            </div>
          </section>

          <section className="section" aria-labelledby="gap">
            <div className="flex flex-wrap justify-between gap-3 mb-4">
              <div>
                <h2 id="gap" className="!text-2xl">Booked but not used</h2>
                <p className="meta">The gap between the dots is bench time someone else could have had.</p>
              </div>
              <Legend items={[{ label: "Used", color: SERIES.used }, { label: "Booked", color: SERIES.booked }]} />
            </div>
            <Dumbbell rows={[...u.data.units].sort((a, b) => b.bookedHours - a.bookedHours).slice(0, 10).map((x) => ({ name: x.name, booked: x.bookedHours, used: x.actualHours }))} />
            <TableView caption="Hours booked and used per unit" head={["Unit", "Lab", "Booked (h)", "Used (h)", "Use"]} rows={[...u.data.units].sort((a, b) => b.bookedHours - a.bookedHours).map((x) => [x.name, x.lab, x.bookedHours, x.actualHours, pct(x.utilisation)])} />
          </section>

          <section className="section grid gap-4" aria-labelledby="radar">
            <div className="flex items-center gap-3">
              <span className="appicon tone-blue" aria-hidden="true"><Radar size={22} /></span>
              <h2 id="radar" className="!text-2xl">Opportunity Radar</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
              <div>
                <p className="font-semibold mb-1">Sitting idle</p>
                <ul className="rows">
                  {u.data.radar.idle.map((i) => (
                    <li key={i.name} className="flex items-center gap-3 py-2.5"><Chip tone="neutral">{pct(i.utilisation)} used</Chip><span className="text-sm">{i.name} · {i.lab}</span></li>
                  ))}
                  {u.data.radar.idle.length === 0 && <li className="meta py-2">Nothing idle.</li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1">Over-demand</p>
                <ul className="rows">
                  {u.data.radar.hot.map((h) => (
                    <li key={h.classLabel} className="flex items-center gap-3 py-2.5"><Chip tone="orange">{Math.round((h.demandHours / h.supplyHours) * 100)}% booked</Chip><span className="text-sm">{h.classLabel}</span></li>
                  ))}
                  {u.data.radar.hot.length === 0 && <li className="meta py-2">No equipment type is over half booked this week.</li>}
                </ul>
              </div>
            </div>
            {u.data.radar.actions.length > 0 && (
              <AiNote source={u.data.radar.source}>
                <ul className="list-disc pl-5 mt-1 grid gap-1">{u.data.radar.actions.map((a) => <li key={a}>{a}</li>)}</ul>
              </AiNote>
            )}
          </section>

          {u.data.decisions.length > 0 && (
            <section className="section" aria-labelledby="decisions">
              <h2 id="decisions" className="!text-2xl mb-3">Recent decisions</h2>
              <ul className="rows">
                {u.data.decisions.map((d) => (
                  <li key={d.id}>
                    <Link to={`/decisions/${d.id}`} className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-xl hover:bg-subtle">
                      <Chip tone="violet">{formatDay(d.createdAt)}</Chip>
                      <span className="text-sm">{d.explanation}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {user?.role === "admin" && (
            <div className="section">
              <button className="btn btn-soft" onClick={() => reset.mutate()} disabled={reset.isPending}>
                {reset.isPending ? <Spinner /> : <RotateCcw size={16} aria-hidden="true" />} {reset.isPending ? "Resetting…" : "Reset demo data"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function FinalsWeekResult({ r }: { r: FinalsWeek }) {
  return (
    <section className="grid gap-6 mb-12 enter" aria-labelledby="finals" aria-live="polite">
      <div>
        <h2 id="finals">Finals Week result</h2>
        <p className="meta mt-1">Five students need {r.equipment.name} for the same two hours.</p>
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
        <DecisionCard decision={r.decision} names={r.names} equipmentName={r.equipment.name} />
        <div className="grid gap-4">
          <h3>LabLink vs first-come-first-served</h3>
          <ul className="rows text-sm">
            <li className="py-2.5"><b>First-come</b> gives it to {r.fairness.fcfsWinner}, who asked first.</li>
            <li className="py-2.5"><b>LabLink</b> gives it to {r.fairness.labLinkWinner}, using verified deadline, stage, recent use, waiting time and fit.</li>
          </ul>
          <Legend items={[{ label: `LabLink (Gini ${r.fairness.giniLabLink.toFixed(2)})`, color: SERIES.lablink }, { label: `First-come (Gini ${r.fairness.giniFcfs.toFixed(2)})`, color: SERIES.fcfs }, { label: "Equality", color: SERIES.equality, dashed: true }]} />
          <Lorenz height={220} series={[{ label: "LabLink", color: SERIES.lablink, values: r.fairness.hoursLabLink }, { label: "First-come", color: SERIES.fcfs, values: r.fairness.hoursFcfs }]} />
          <p className="meta">Lab hours across these five students after the slot is given out. Everyone who missed out was offered an alternative.</p>
          <Link to={`/decisions/${r.decision.id}`} className="btn btn-soft justify-self-start">Open the decision record</Link>
        </div>
      </div>
    </section>
  );
}
