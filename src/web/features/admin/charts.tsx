/**
 * Analytics charts as plain SVG (no chart library): a utilisation ring, a Lorenz curve
 * for fairness, a day × hour demand heatmap, a booked-vs-used dumbbell plot, and a
 * daily trend line. Palette validated with the dataviz checker: booked #ff8a3d,
 * used #0b7a48, LabLink #5f35d9 (orange's low contrast is relieved by direct labels
 * and every chart's table view). Thin marks, recessive axes, hover tooltips.
 */
import { useId, useState, type ReactNode } from "react";

export const SERIES = { booked: "#ff8a3d", used: "#0b7a48", lablink: "#5f35d9", fcfs: "#ff8a3d", equality: "var(--ink-400)" };

/* ------------------------------ shared bits ------------------------------ */

interface Tip {
  x: number | string;
  y: number;
  lines: ReactNode[];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 card !p-2.5 !rounded-xl text-sm min-w-36 enter" style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))", boxShadow: "var(--shadow-float)" }} role="status">
      {tip.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: color }} aria-hidden="true" />;
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-ink-2" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center">
          {i.dashed ? <span className="inline-block w-4 border-t-2 border-dashed mr-1.5" style={{ borderColor: i.color }} aria-hidden="true" /> : <Swatch color={i.color} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Every chart can be read as a table (screen readers, low vision, print). */
export function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer meta inline-flex min-h-11 items-center">Show as table</summary>
      <div className="overflow-x-auto">
        <table className="w-full mt-2">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-ink-2">{head.map((h) => <th key={h} className="py-1.5 pr-4 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1.5 pr-4">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* -------------------------------- ring ---------------------------------- */

/** Single headline: a number in a thin progress ring. */
export function UtilRing({ value, label }: { value: number; label: string }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  return (
    <figure className="flex items-center gap-5">
      <svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label={`${label}: ${Math.round(value * 100)}%`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth="12" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--green)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, value))} transform="rotate(-90 64 64)" className="ring-fill" />
        <text x="64" y="72" textAnchor="middle" className="font-display" fontSize="28" fill="var(--ink-900)">
          {Math.round(value * 100)}%
        </text>
      </svg>
      <figcaption className="meta max-w-48">{label}</figcaption>
    </figure>
  );
}

/* ------------------------------- Lorenz --------------------------------- */

/** Cumulative share of hours (y) held by the bottom x share of students. */
function lorenzPoints(values: number[]): [number, number][] {
  const xs = [...values].sort((a, b) => a - b);
  const total = xs.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return [[0, 0], ...xs.map((v, i) => ((acc += v), [(i + 1) / xs.length, acc / total] as [number, number]))];
}

export function Lorenz({ series, height = 260 }: { series: { label: string; color: string; values: number[] }[]; height?: number }) {
  const W = 320;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 34 };
  const sx = (x: number) => pad.l + x * (W - pad.l - pad.r);
  const sy = (y: number) => H - pad.b - y * (H - pad.t - pad.b);
  const [tip, setTip] = useState<Tip | null>(null);
  const curves = series.map((s) => ({ ...s, pts: lorenzPoints(s.values) }));
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, ((e.clientX - box.left) * (W / box.width) - pad.l) / (W - pad.l - pad.r)));
    const lines = curves.map((c) => {
      const p = c.pts.reduce((best, q) => (Math.abs(q[0] - fx) < Math.abs(best[0] - fx) ? q : best));
      return (
        <span key={c.label}>
          <Swatch color={c.color} />
          {c.label}: bottom {Math.round(p[0] * 100)}% had {Math.round(p[1] * 100)}% of hours
        </span>
      );
    });
    setTip({ x: ((sx(fx) / W) * box.width), y: (sy(0.5) / H) * box.height, lines });
  };

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" role="img" aria-label={`Lorenz curve of lab hours: ${curves.map((c) => c.label).join(" and ")}. The closer to the diagonal, the fairer.`} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} stroke="var(--line)" />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="var(--ink-600)">{t * 100}%</text>
            <text x={sx(t)} y={H - pad.b + 16} textAnchor="middle" fontSize="10" fill="var(--ink-600)">{t * 100}%</text>
          </g>
        ))}
        <text x={sx(0.5)} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--ink-600)">share of students (least → most hours)</text>
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={SERIES.equality} strokeWidth="1.5" strokeDasharray="4 4" />
        <text x={sx(0.62)} y={sy(0.7)} fontSize="10" fill="var(--ink-600)" transform={`rotate(${-Math.atan((H - pad.t - pad.b) / (W - pad.l - pad.r)) * (180 / Math.PI)} ${sx(0.62)} ${sy(0.7)})`}>perfect equality</text>
        {curves.map((c) => (
          <path key={c.label} d={path(c.pts)} fill="none" stroke={c.color} strokeWidth="2" strokeLinejoin="round" className="draw-line" />
        ))}
      </svg>
      <Tooltip tip={tip} />
    </figure>
  );
}

/* ------------------------------- heatmap -------------------------------- */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Sequential single-hue ramp (orange tint → orange ink): more demand, darker. */
const RAMP = ["#fff0e5", "#ffd2b0", "#ffb07a", "#ff8a3d", "#e0651a", "#b4480c"];

export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const [tip, setTip] = useState<Tip | null>(null);
  const cell = 26;
  const gap = 2;
  const left = 34;
  const top = 16;
  const W = left + 14 * (cell + gap);
  const H = top + 7 * (cell + gap);
  const colour = (v: number) => (v === 0 ? "var(--bg-subtle)" : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1e-9)))]!);
  return (
    <figure className="relative">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px] h-auto" role="img" aria-label="Booked lab hours by weekday and hour. Darker means busier." onPointerLeave={() => setTip(null)}>
          {Array.from({ length: 14 }, (_, h) => (h % 2 === 0 ? <text key={h} x={left + h * (cell + gap) + cell / 2} y={10} textAnchor="middle" fontSize="9" fill="var(--ink-600)">{h + 8}</text> : null))}
          {grid.map((row, d) => (
            <g key={d}>
              <text x={left - 6} y={top + d * (cell + gap) + cell / 2 + 3} textAnchor="end" fontSize="10" fill="var(--ink-600)">{DAYS[d]}</text>
              {row.map((v, h) => (
                <rect
                  key={h}
                  x={left + h * (cell + gap)}
                  y={top + d * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx="4"
                  fill={colour(v)}
                  onPointerEnter={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({ x: ((left + h * (cell + gap) + cell / 2) / W) * box.width, y: ((top + d * (cell + gap)) / H) * box.height, lines: [<b key="t">{DAYS[d]} {h + 8}:00–{h + 9}:00</b>, `${v} lab hours booked`] });
                  }}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-ink-2" aria-hidden="true">
        quiet
        {RAMP.map((c) => <span key={c} className="w-5 h-2.5 rounded-sm" style={{ background: c }} />)}
        busy
      </div>
      <Tooltip tip={tip} />
    </figure>
  );
}

/* ------------------------------- dumbbell ------------------------------- */

export function Dumbbell({ rows }: { rows: { name: string; booked: number; used: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.booked));
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure aria-labelledby={id}>
      <figcaption id={id} className="sr-only">Hours booked versus hours actually used, per unit</figcaption>
      <ul className="grid gap-1">
        {rows.map((r, i) => {
          const gapH = Math.round((r.booked - r.used) * 10) / 10;
          return (
            <li key={r.name} className={`grid grid-cols-[minmax(120px,170px)_1fr_auto] items-center gap-3 py-1.5 rounded-lg ${hover === i ? "bg-subtle" : ""}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <span className="text-sm truncate" title={r.name}>{r.name}</span>
              <span className="relative h-3" aria-hidden="true">
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <span className="absolute top-1/2 h-0.5 -mt-px bg-ink-3" style={{ left: `${(r.used / max) * 100}%`, width: `${((r.booked - r.used) / max) * 100}%` }} />
                <span className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ring-2 ring-white" style={{ left: `${(r.used / max) * 100}%`, background: SERIES.used }} />
                <span className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ring-2 ring-white" style={{ left: `${(r.booked / max) * 100}%`, background: SERIES.booked }} />
              </span>
              <span className="text-sm tabular-nums text-ink-2 whitespace-nowrap min-w-52 text-right">
                <span className="sr-only">{r.name}: </span>
                {r.used}h used of {r.booked}h
                {gapH > 0 && <span className="text-orange-ink"> · {gapH}h unused</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/* -------------------------------- trend --------------------------------- */

export function Trend({ daily }: { daily: { day: string; booked: number; used: number }[] }) {
  const W = 560;
  const H = 200;
  const pad = { l: 34, r: 56, t: 12, b: 26 };
  const max = Math.max(1, ...daily.map((d) => d.booked));
  const sx = (i: number) => pad.l + (i / Math.max(1, daily.length - 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const [hi, setHi] = useState<number | null>(null);
  const line = (k: "booked" | "used") => daily.map((d, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(d[k]).toFixed(1)}`).join("");
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
  const last = daily.length - 1;
  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label="Lab hours booked and used per day over the last week"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - box.left) * (W / box.width);
          setHi(Math.max(0, Math.min(last, Math.round(((x - pad.l) / (W - pad.l - pad.r)) * last))));
        }}
        onPointerLeave={() => setHi(null)}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(max * t)} y2={sy(max * t)} stroke="var(--line)" />
            <text x={pad.l - 6} y={sy(max * t) + 4} textAnchor="end" fontSize="10" fill="var(--ink-600)">{Math.round(max * t)}h</text>
          </g>
        ))}
        {daily.map((d, i) => <text key={d.day} x={sx(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-600)">{label(d.day)}</text>)}
        {hi !== null && <line x1={sx(hi)} x2={sx(hi)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-400)" strokeDasharray="3 3" />}
        <path d={line("booked")} fill="none" stroke={SERIES.booked} strokeWidth="2" strokeLinejoin="round" />
        <path d={line("used")} fill="none" stroke={SERIES.used} strokeWidth="2" strokeLinejoin="round" />
        {(["booked", "used"] as const).map((k) => (
          <g key={k}>
            <circle cx={sx(last)} cy={sy(daily[last]![k])} r="4" fill={SERIES[k]} stroke="#fff" strokeWidth="2" />
            <text x={sx(last) + 8} y={sy(daily[last]![k]) + 4} fontSize="11" fill="var(--ink-900)">{k === "booked" ? "Booked" : "Used"}</text>
          </g>
        ))}
        {hi !== null && (["booked", "used"] as const).map((k) => <circle key={k} cx={sx(hi)} cy={sy(daily[hi]![k])} r="4" fill={SERIES[k]} stroke="#fff" strokeWidth="2" />)}
      </svg>
      {hi !== null && (
        <Tooltip
          tip={{
            x: `${(sx(hi) / W) * 100}%`,
            y: 24,
            lines: [<b key="d">{label(daily[hi]!.day)}</b>, <span key="b"><Swatch color={SERIES.booked} />Booked {daily[hi]!.booked}h</span>, <span key="u"><Swatch color={SERIES.used} />Used {daily[hi]!.used}h</span>],
          }}
        />
      )}
    </figure>
  );
}
