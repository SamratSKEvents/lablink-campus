/**
 * Live resource twin: every lab and unit coloured by status. Selecting a blocked unit
 * draws a path to the nearest working unit of the same type (Rescue Mode, on the map).
 */
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { LabWithUnits } from "../../lib/types";
import { Chip, ErrorNote, Loading, LIVE_STATUS, PageHeader, Skeleton } from "../../components/ui";
import { ViewToggle, useViewMode } from "../../three/ViewToggle";

const Twin = lazy(() => import("../../three/Twin"));

/** Nearest working unit of the same class (by lab map distance) for a blocked unit. */
export function rescueTarget(labs: LabWithUnits[], unitId: string): string | undefined {
  const from = labs.find((l) => l.equipment.some((e) => e.id === unitId));
  const unit = from?.equipment.find((e) => e.id === unitId);
  if (!from || !unit || (unit.liveStatus !== "maintenance" && unit.liveStatus !== "sos")) return undefined;
  let best: { id: string; d: number } | undefined;
  for (const l of labs)
    for (const e of l.equipment)
      if (e.classId === unit.classId && e.liveStatus === "free") {
        const d = Math.hypot(l.map.x - from.map.x, l.map.z - from.map.z);
        if (!best || d < best.d) best = { id: e.id, d };
      }
  return best?.id;
}

export default function LabMap() {
  const [mode, setMode] = useViewMode();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["labs"], queryFn: () => api<{ labs: LabWithUnits[] }>("/labs"), refetchInterval: 10_000 });
  const labs = useMemo(() => data?.labs ?? [], [data]);
  const all = labs.flatMap((l) => l.equipment.map((e) => ({ ...e, lab: l.name })));
  const unit = all.find((e) => e.id === selected);
  const rescueTo = selected ? rescueTarget(labs, selected) : undefined;
  const target = all.find((e) => e.id === rescueTo);
  const counts = all.reduce<Record<string, number>>((acc, e) => ((acc[e.liveStatus] = (acc[e.liveStatus] ?? 0) + 1), acc), {});

  return (
    <>
      <PageHeader title="Lab map" lead="Every lab across campus, live. Pick a red unit to see where its work can move." action={<ViewToggle mode={mode} onChange={setMode} />} />
      <div className="flex flex-wrap gap-2 mb-4" aria-label="Status legend">
        {Object.entries(LIVE_STATUS).map(([k, v]) => (
          <Chip key={k} tone={v.tone}>{v.label} · {counts[k] ?? 0}</Chip>
        ))}
      </div>
      <ErrorNote error={error} />
      {isLoading && <Loading label="Loading the map" />}
      {data && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {mode === "3d" ? (
            <section className="card !p-0 overflow-hidden h-[520px]" aria-label="3D campus lab map. Use the list view for a keyboard-friendly version.">
              <Suspense fallback={<Skeleton className="h-full !rounded-none" />}>
                <Twin labs={labs} selected={selected} rescueTo={rescueTo} onSelect={setSelected} />
              </Suspense>
            </section>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2" aria-label="Labs and their equipment">
              {labs.map((l) => (
                <div key={l.id} className="card !p-4">
                  <h2 className="!text-lg">{l.name}</h2>
                  <p className="meta mb-2">{l.building}</p>
                  <ul className="grid gap-1">
                    {l.equipment.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setSelected(e.id)} aria-pressed={selected === e.id} className={`w-full text-left flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl hover:bg-subtle ${selected === e.id ? "bg-subtle" : ""}`}>
                          <span className="text-sm">{e.name}</span>
                          <Chip tone={LIVE_STATUS[e.liveStatus]!.tone}>{LIVE_STATUS[e.liveStatus]!.label}</Chip>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <aside className="card grid gap-3 content-start" aria-live="polite" aria-label="Selected unit">
            {!unit ? (
              <p className="meta">Select a unit on the map or in the list.</p>
            ) : (
              <>
                <h2 className="!text-xl">{unit.name}</h2>
                <p className="meta">{unit.classLabel} · {unit.lab}, bench {unit.bench}</p>
                <Chip tone={LIVE_STATUS[unit.liveStatus]!.tone} className="justify-self-start">{LIVE_STATUS[unit.liveStatus]!.label}</Chip>
                {target && (
                  <div className="task-row !bg-green-tint text-green-ink">
                    Work can move to <b>{target.name}</b> in {target.lab}.
                  </div>
                )}
                {(unit.liveStatus === "maintenance" || unit.liveStatus === "sos") && !target && <p className="meta">No free unit of this type right now. Rescue Mode will offer later slots.</p>}
                <Link to={`/equipment/${unit.id}`} className="btn btn-soft">Open details</Link>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
